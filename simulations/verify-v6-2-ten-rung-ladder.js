// Mainnet-fork simulation ONLY. No signing or broadcast.
// Uses the deployed v6-2 market and ladder; deploys 0..90 bps band rungs in
// the fork, with all market references retargeted from v6 to v6-2.
// Existing orders are cancelled in the fork to isolate the ladder's fills.
// Run: node simulations/verify-v6-2-ten-rung-ladder.js
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  Cl, ClarityVersion, serializeCV, hexToCV, cvToString, deserializeCV,
  getAddressFromPrivateKey,
} from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult } from 'stxer';
import { fetchLazerUpdateAny } from './_lazer.js';
import { installChunkedSubmit } from './_chunked-submit.js';
installChunkedSubmit(40);

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-2`, LADDER = `${DEP}.jing-ladder`;
const HELPER = `${DEP}.jing-ladder-dispatch`;
const API = process.env.STACKS_API_URL || 'http://77.42.3.101/stacks-api';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const cp = (s) => Cl.contractPrincipal(...s.split('.'));
const sx = cp(SBTC), sy = cp(WSTX), nx = Cl.stringAscii('sbtc-token'), ny = Cl.stringAscii('wstx');
const WHALE_X = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const WHALE_Y = 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51';
const wallet = (n) => getAddressFromPrivateKey(n.toString(16).padStart(64, '0') + '01', 'mainnet');
const A = wallet(1501), S = wallet(1502), TX = wallet(1503), TY = wallet(1504);
const SPREADS = Array.from({ length: 10 }, (_, i) => i * 10);
const rung = (side, s) => `${DEP}.jing-${side}-stx-spread-${s}`;
const RX = 20_000n, RY = 20_000_000n, SCALE = 10_000_000_000n, BPS = 10_000n;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const field = (s, k) => String(s).match(new RegExp(`\\(${k} (u?\\d+|true|false|none|\\(some u\\d+\\))\\)`))?.[1];
const num = (s) => {
  const m = String(s).match(/^u(\d+)$/);
  if (!m) throw new Error(`Expected uint, got ${s}`);
  return BigInt(m[1]);
};
const ok = (s) => s.startsWith('(ok');
const observe = () => true;
const between = (lo, hi) => (s) => num(s) >= lo && num(s) <= hi;
async function read(cid, fn, args = []) {
  const [addr, name] = cid.split('.');
  const r = await fetch(`${API}/v2/contracts/call-read/${addr}/${name}/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sender: DEP, arguments: args.map(a => '0x' + serializeCV(a)) }),
  });
  const j = await r.json();
  if (!j.okay) throw new Error(JSON.stringify(j));
  return cvToString(hexToCV(j.result));
}
function decode(step, kind) {
  const r = step?.Result?.[kind === 'tx' ? 'Transaction' : 'Eval'];
  if (!r || !('Ok' in r)) return `ERROR ${JSON.stringify(r)}`;
  if (kind === 'eval') return cvToString(deserializeCV(r.Ok));
  if (r.Ok.vm_error) return `VM ERROR ${r.Ok.vm_error}`;
  return cvToString(deserializeCV(r.Ok.result));
}
function prints(step) {
  return (step?.Result?.Transaction?.Ok?.events || []).flatMap(e => {
    const o = typeof e === 'string' ? JSON.parse(e) : e;
    return o.contract_event?.raw_value ? [cvToString(hexToCV(o.contract_event.raw_value))] : [];
  });
}

async function main() {
  const live = await (await fetch(`${API}/v2/contracts/source/${DEP}/markets-sbtc-stx-jing-v6-2?proof=0`)).json();
  const local = fs.readFileSync('contracts/markets-sbtc-stx-jing-v6-2.clar', 'utf8');
  if (live.source !== local) throw new Error('Local v6-2 source differs from deployed source. Review before running.');
  const cycle = num(await read(MARKET, 'get-current-cycle'));
  const residents = {};
  for (const side of ['x', 'y']) {
    const s = await read(MARKET, `get-token-${side}-depositors`, [Cl.uint(cycle)]);
    residents[side] = s.replace(/^\(list\s*|\)$/g, '').trim().split(/\s+/).filter(Boolean);
  }
  for (const side of ['buy-band', 'sel-band']) {
    if (await read(LADDER, 'get-band-count', [Cl.stringAscii(side)]) !== 'u0') {
      throw new Error('Ladder already has seats; review setup rather than replacing them implicitly.');
    }
  }
  const lz = await fetchLazerUpdateAny(), update = Cl.buffer(Buffer.from(lz.hex, 'hex'));
  const mid = lz.px * 100_000_000n / lz.py;
  const price = (side, s) => mid * (BPS + (side === 'buy' ? 1n : -1n) * BigInt(s)) / BPS;
  const heldSell = SPREADS.filter(s => price('sell', s) >= mid - mid * 40n / BPS);
  // Reserve the maximum age-dependent rebate; partial-fill checks allow the
  // resulting small difference versus a fresh update's 20 bps deduction.
  const gross = (net) => (net * BPS + 9929n) / 9930n;
  const partialY = gross(SPREADS.slice(0, 5).reduce((a, s) => a + RX * price('buy', s) / SCALE, 0n) + 8_000n * price('buy', 50) / SCALE);
  const partialX = gross(SPREADS.slice(0, 5).reduce((a, s) => a + RY * SCALE / price('sell', s), 0n) + 8_000_000n * SCALE / price('sell', 50));
  const sweepY = gross(80_000n * price('buy', 75) / SCALE);
  const sweepX = gross(80_000_000n * SCALE / price('sell', 75));
  let b = SimulationBuilder.new({ stacksNodeAPI: API });
  const steps = [], swaps = [], snapshots = [];
  function tx(label, sender, cid, fn, args, want = '(ok true)') {
    b = b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    const st = { label, kind: 'tx', want }; steps.push(st); return st;
  }
  function ev(label, code, want = observe, cid = MARKET) {
    b = b.addEvalCode(cid, code); const st = { label, kind: 'eval', want }; steps.push(st); return st;
  }
  function snapshot(label) {
    const rows = [];
    for (const side of ['buy', 'sell']) for (const s of SPREADS) {
      rows.push({ side, spread: s, state: ev(`${label} ${side}-${s}`, '(get-state)', observe, rung(side, s)) });
    }
    snapshots.push({ label, rows });
  }
  const marketAmount = (side, s) => `(get-token-${side === 'buy' ? 'x' : 'y'}-deposit (get-current-cycle) '${rung(side, s)})`;
  const balance = (who, asset) => asset === 'stx' ? `(stx-get-balance '${who})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`;
  const treasury = ev('treasury', '(var-get treasury)');
  // Fork-only cancellations: actual contract calls, no direct storage writes.
  for (const side of ['x', 'y']) for (const who of residents[side]) {
    tx(`fork setup cancel existing ${side}: ${who}`, who, MARKET, `cancel-token-${side}-deposit`, side === 'x' ? [sx, nx] : [sy, ny], ok);
  }
  for (const side of ['x', 'y']) ev(`isolated ${side} book empty`, `(len (get-token-${side}-depositors (get-current-cycle)))`, 'u0');
  const sourceHashes = {}, rungSources = {};
  for (const side of ['buy', 'sell']) {
    const source = fs.readFileSync(`contracts/jing-${side}-stx-core-spread.clar`, 'utf8')
      .replaceAll(`${DEP}.markets-sbtc-stx-jing-v6`, MARKET)
      .split('\n').filter(l => !/^\s*;;/.test(l)).join('\n');
    sourceHashes[side] = sha(source);
    rungSources[side] = source;
    for (const s of SPREADS) {
      b = b.withSender(DEP).addContractDeploy({ contract_name: rung(side, s).split('.')[1], source_code: source, clarity_version: ClarityVersion.Clarity5 });
      steps.push({ label: `deploy ${side}-${s}`, kind: 'tx', want: ok });
    }
    tx(`canonical ${side}`, DEP, LADDER, 'set-canonical', [Cl.stringAscii(side === 'buy' ? 'buy-band' : 'sel-band'), cp(rung(side, 0))]);
    for (const s of SPREADS) tx(`seat ${side}-${s}`, DEP, rung(side, s), 'initialize', [Cl.uint(s), Cl.bool(true)]);
    ev(`${side} has ten seats`, `(get-band-count "${side === 'buy' ? 'buy-band' : 'sel-band'}")`, 'u10', LADDER);
    ev(`${side} market has ten seats`, `(len (get-seated-${side === 'buy' ? 'x' : 'y'}))`, 'u10');
  }
  for (const name of ['jing-rung-deposit-trait', 'jing-ladder-dispatch']) {
    b = b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: fs.readFileSync(`contracts/${name}.clar`, 'utf8'), clarity_version: ClarityVersion.Clarity5 });
    steps.push({ label: `deploy ${name}`, kind: 'tx', want: ok });
  }
  for (const who of [A, S, TX, TY]) {
    b = b.withSender(WHALE_Y).addSTXTransfer({ recipient: who, amount: 700_000_000 });
    steps.push({ label: `fund STX ${who}`, kind: 'tx', want: ok });
    tx(`fund sBTC ${who}`, WHALE_X, SBTC, 'transfer', [Cl.uint(400_000), Cl.standardPrincipal(WHALE_X), Cl.standardPrincipal(who), Cl.none()]);
  }
  // Include every recipient of trading/claim transfers, including treasury;
  // transaction fees are zero in this simulation.
  const people = [A, S, TX, TY, DEP, MARKET, ...['buy', 'sell'].flatMap(side => SPREADS.map(s => rung(side, s)))];
  const totalCode = (asset) => `(+ ${people.map(p => balance(p, asset)).join(' ')})`;
  const before = Object.fromEntries(['stx', 'sbtc'].map(a => [a, ev(`conservation ${a} before`, totalCode(a))]));
  const feeBefore = Object.fromEntries(['stx', 'sbtc'].map(a => [a, ev(`treasury ${a} before`, balance(DEP, a))]));
  ev('current maker margin', '(get-maker-margin-bps)', 'u40');
  const allocation = (side, entries) => Cl.list(entries.map(([s, amount]) => Cl.tuple({ rung: cp(rung(side, s)), amount: Cl.uint(amount) })));
  const dispatch = (label, side, total, entries, want) => tx(label, side === 'buy' ? A : S, HELPER, `deposit-${side}`, [Cl.uint(total), allocation(side, entries), update], want);
  dispatch('helper refuses empty allocation', 'buy', RX, [], '(err u7101)');
  dispatch('helper refuses total below sum', 'buy', RX - 1n, [[0, RX]], '(err u7102)');
  dispatch('helper refuses total above sum', 'buy', RX + 1n, [[0, RX]], '(err u7102)');
  dispatch('helper refuses zero amount', 'buy', RX, [[0, 0n], [10, RX]], '(err u7103)');
  dispatch('helper refuses duplicate rung', 'buy', RX * 2n, [[0, RX], [0, RX]], '(err u7105)');
  tx('helper refuses wrong side', A, HELPER, 'deposit-buy', [Cl.uint(RX), allocation('sell', [[0, RX]]), update], '(err u7104)');
  // First nested deposit succeeds, second is below the rung minimum. The
  // outer error must roll back the first rung, market state and transfers.
  const rollbackBefore = ev('rollback wallet before', balance(A, 'sbtc'));
  dispatch('helper rolls back earlier deposit when second rung fails', 'buy', RX + 1n, [[0, RX], [10, 1n]], '(err u7005)');
  const rollbackAfter = ev('rollback wallet after', balance(A, 'sbtc'));
  ev('rollback first rung has no user shares', `(get-position '${A})`, v => field(v, 'shares') === 'u0', rung('buy', 0));
  ev('rollback first rung has no market order', marketAmount('buy', 0), 'u0');
  for (const side of ['buy', 'sell']) {
    const size = side === 'buy' ? RX : RY;
    dispatch(`ONE CALL: member deposits into ten ${side} rungs`, side, size * 10n, SPREADS.map(s => [s, size]), `(ok (tuple (amount u${size * 10n}) (rungs u10)))`);
    for (const s of SPREADS) {
    const cid = rung(side, s), amount = side === 'buy' ? RX : RY;
    ev(`member position ${side}-${s}`, `(get-position '${side === 'buy' ? A : S})`, v => num(field(v, 'shares')) > 0n, cid);
    ev(`helper owns no shares ${side}-${s}`, `(get-position '${HELPER})`, v => field(v, 'shares') === 'u0', cid);
    ev(`seat protected ${side}-${s}`, `(is-protected-${side === 'buy' ? 'x' : 'y'} '${cid})`, 'true');
    // All buy rungs go first. The zero buy causes the opposing <=40 bps
    // deposits to be held under v6-2's maker-admission margin.
    const held = side === 'sell' && heldSell.includes(s);
    ev(`initial ${side}-${s} held/resting`, '(get-state)', v => field(v, 'resting') === `u${held ? 0n : amount}` && field(v, side === 'buy' ? 'held-sats' : 'held-ustx') === `u${held ? amount : 0n}`, cid);
    }
  }
  snapshot('after deposits');
  function take(label, side, amount, limitSpread, expectedWalk, rejected = false) {
    const isX = side === 'sell', who = isX ? TX : TY;
    const input = isX ? 'sbtc' : 'stx', output = isX ? 'stx' : 'sbtc';
    const fundsBefore = ev(`${label} input before`, balance(who, input));
    const outBefore = ev(`${label} output before`, balance(who, output));
    const st = tx(label, who, MARKET, 'swap', [Cl.uint(amount), Cl.uint(price(side, limitSpread)), update, sx, nx, sy, ny, Cl.bool(isX)], rejected ? '(err u1017)' : ok);
    const fundsAfter = ev(`${label} input after`, balance(who, input));
    const outAfter = ev(`${label} output after`, balance(who, output));
    ev(`${label} taker leaves no resting order`, `(get-token-${isX ? 'x' : 'y'}-deposit (get-current-cycle) '${who})`, 'u0');
    for (const s of SPREADS) tx(`${label} sync ${side}-${s}`, TY, rung(side, s), 'sync', []);
    swaps.push({ label, side, amount: String(amount), input, output, limitSpread, expectedWalk, rejected, st, fundsBefore, fundsAfter, outBefore, outAfter });
  }
  take('T1 STX taker fills five buy rungs and part of sixth', 'buy', partialY, 55, [10, 20, 30, 40, 50]);
  for (const s of SPREADS) ev(`T1 remaining buy-${s}`, marketAmount('buy', s), s < 50 ? 'u0' : s === 50 ? between(11_000n, 12_100n) : `u${RX}`);
  for (const s of heldSell) {
    tx(`keeper retries held sell-${s}`, TY, rung('sell', s), 'push', [update]);
    ev(`sell-${s} now resting`, marketAmount('sell', s), `u${RY}`);
  }
  take('T2 sBTC taker fills five sell rungs and part of sixth', 'sell', partialX, 55, [10, 20, 30, 40, 50]);
  for (const s of SPREADS) ev(`T2 remaining sell-${s}`, marketAmount('sell', s), s < 50 ? 'u0' : s === 50 ? between(11_000_000n, 12_100_000n) : `u${RY}`);
  snapshot('after partial sweeps');
  // v6-2 swap is fill-or-kill: insufficient depth inside the limit reverts.
  take('T3 oversized STX taker at +65 reverts atomically', 'buy', partialY, 65, [], true);
  take('T4 oversized sBTC taker at -65 reverts atomically', 'sell', partialX, 65, [], true);
  for (const side of ['buy', 'sell']) for (const s of SPREADS) {
    ev(`rejected sweep leaves ${side}-${s}`, marketAmount(side, s), s < 50 ? 'u0' : s === 50 ? (side === 'buy' ? between(11_000n, 12_100n) : between(11_000_000n, 12_100_000n)) : `u${side === 'buy' ? RX : RY}`);
  }
  take('T5 STX taker fills 50 through 80 and part of 90', 'buy', sweepY, 95, [50, 60, 70, 80, 90]);
  take('T6 sBTC taker fills 50 through 80 and part of 90', 'sell', sweepX, 95, [50, 60, 70, 80, 90]);
  const claims = [];
  for (const side of ['buy', 'sell']) {
    const who = side === 'buy' ? A : S, asset = side === 'buy' ? 'stx' : 'sbtc';
    const pre = ev(`${side} member proceeds before claims`, balance(who, asset));
    for (const s of SPREADS) {
      const cid = rung(side, s);
      if (s === 90) {
        ev(`final ${side}-90 partially filled`, marketAmount(side, s), side === 'buy' ? between(9_000n, 13_000n) : between(9_000_000n, 13_000_000n));
        tx(`member withdraws unsold ${side}-90 and receives accrued proceeds`, who, cid, 'withdraw', [Cl.uint(side === 'buy' ? RX : RY)]);
      } else {
        ev(`final ${side}-${s} market empty`, marketAmount(side, s), 'u0');
        ev(`final ${side}-${s} epoch closed`, '(get-state)', v => field(v, 'epoch') === 'u1' && field(v, 'total-shares') === 'u0', cid);
        tx(`member claims ${side}-${s}`, who, cid, 'claim', []);
      }
      ev(`member position cleared ${side}-${s}`, `(get-position '${who})`, v => field(v, 'shares') === 'u0' && field(v, 'stx') === 'u0' && field(v, 'sbtc') === 'u0', cid);
      tx(`no double claim ${side}-${s}`, who, cid, 'claim', [], '(err u7006)');
    }
    claims.push({ side, asset, pre, post: ev(`${side} member proceeds after claims`, balance(who, asset)) });
  }
  // Fresh positions prove one helper call can exit several real rungs. The
  // rungs pay assets and any accrued proceeds directly to the user.
  for (const side of ['buy', 'sell']) {
    const who = side === 'buy' ? A : S;
    const amount = side === 'buy' ? 1000n : 1_000_000n;
    const entries = [[0, amount], [10, amount], [20, amount]];
    dispatch(`ONE CALL: seed three ${side} rungs for batch withdrawal`, side, amount * 3n, entries,
      `(ok (tuple (amount u${amount * 3n}) (rungs u3)))`);
    tx(`ONE CALL: withdraw user from three ${side} rungs`, who, HELPER, `withdraw-${side}`,
      [allocation(side, entries.map(([spread]) => [spread, amount * 2n]))],
      '(ok (tuple (rungs u3) (withdrawn u3)))');
    for (const [spread] of entries) {
      ev(`batch withdrawal clears ${side}-${spread} user position`, `(get-position '${who})`,
        v => field(v, 'shares') === 'u0' && field(v, 'stx') === 'u0' && field(v, 'sbtc') === 'u0',
        rung(side, spread));
    }
  }
  snapshot('after full sweeps and claims');
  const after = Object.fromEntries(['stx', 'sbtc'].map(a => [a, ev(`conservation ${a} after`, totalCode(a))]));
  const feeAfter = Object.fromEntries(['stx', 'sbtc'].map(a => [a, ev(`treasury ${a} after`, balance(DEP, a))]));
  ev('helper never holds STX', balance(HELPER, 'stx'), 'u0');
  ev('helper never holds sBTC', balance(HELPER, 'sbtc'), 'u0');
  // Replace a funded seat with the same canonical code under another deployer.
  // Then change its spread by retiring 90 and seating a registered 100 rung.
  const replacement = `${S}.jing-buy-stx-spread-90`, hundred = rung('buy', 100);
  for (const [sender, cid] of [[S, replacement], [DEP, hundred]]) {
    b = b.withSender(sender).addContractDeploy({ contract_name: cid.split('.')[1], source_code: rungSources.buy, clarity_version: ClarityVersion.Clarity5 });
    steps.push({ label: `deploy seat-update candidate ${cid}`, kind: 'tx', want: ok });
  }
  const seatBalance = `(+ ${[A, MARKET, rung('buy', 90), replacement, hundred].map(p => balance(p, 'sbtc')).join(' ')})`;
  const seatBefore = ev('seat update funds before', seatBalance);
  tx('fund original buy-90 before replacing it', A, rung('buy', 90), 'deposit', [Cl.uint(RX), update]);
  ev('original buy-90 is funded', marketAmount('buy', 90), between(RX - 1n, RX + 1n));
  tx('unauthorized replacement initialization refused', S, replacement, 'initialize', [Cl.uint(90), Cl.bool(true)], '(err u7001)');
  tx('owner registers replacement at same spread', DEP, replacement, 'initialize', [Cl.uint(90), Cl.bool(true)]);
  ev('replacement keeps count at ten', '(get-band-count "buy-band")', 'u10', LADDER);
  ev('replacement is current', `(is-current-rung '${replacement})`, 'true', LADDER);
  ev('original is no longer current', `(is-current-rung '${rung('buy', 90)})`, 'false', LADDER);
  ev('original remains registered', `(is-registered '${rung('buy', 90)})`, 'true', LADDER);
  ev('original funds remain resting after replacement', marketAmount('buy', 90), between(RX - 1n, RX + 1n));
  ev('old seat removed from market list', `(is-protected-x '${rung('buy', 90)})`, 'false');
  ev('replacement protected on market', `(is-protected-x '${replacement})`, 'true');
  dispatch('helper rejects replaced rung from stale frontend allocation', 'buy', RX, [[90, RX]], '(err u7104)');
  tx('helper deposits into current replacement', A, HELPER, 'deposit-buy', [Cl.uint(1000), Cl.list([Cl.tuple({ rung: cp(replacement), amount: Cl.uint(1000) })]), update], '(ok (tuple (amount u1000) (rungs u1)))');
  tx('register 100 bps without taking a seat', DEP, hundred, 'initialize', [Cl.uint(100), Cl.bool(false)]);
  dispatch('helper rejects registered but unseated rung', 'buy', RX, [[100, RX]], '(err u7104)');
  tx('cannot add eleventh seat', DEP, LADDER, 'seat-band', [cp(hundred)], '(err u6011)');
  tx('unauthorized retire refused', A, LADDER, 'retire-band', [Cl.stringAscii('buy-band'), Cl.uint(90)], '(err u6001)');
  tx('owner retires 90 bps seat', DEP, LADDER, 'retire-band', [Cl.stringAscii('buy-band'), Cl.uint(90)]);
  tx('owner seats 100 bps instead', DEP, LADDER, 'seat-band', [cp(hundred)]);
  tx('keeper syncs replacement spread to market', TY, MARKET, 'sync-seat', [cp(hundred)], ok);
  ev('changed spread has ten market seats', '(len (get-seated-x))', 'u10');
  ev('100 is now protected', `(is-protected-x '${hundred})`, 'true');
  ev('90 replacement is no longer protected', `(is-protected-x '${replacement})`, 'false');
  tx('ONE CALL: withdraw user from original replaced and retired replacement rungs', A, HELPER, 'withdraw-buy',
    [Cl.list([
      Cl.tuple({ rung: cp(rung('buy', 90)), amount: Cl.uint(RX * 2n) }),
      Cl.tuple({ rung: cp(replacement), amount: Cl.uint(2000) }),
    ])], '(ok (tuple (rungs u2) (withdrawn u2)))');
  ev('original replaced rung user position cleared', `(get-position '${A})`,
    v => field(v, 'shares') === 'u0' && field(v, 'stx') === 'u0' && field(v, 'sbtc') === 'u0', rung('buy', 90));
  ev('retired replacement user position cleared', `(get-position '${A})`,
    v => field(v, 'shares') === 'u0' && field(v, 'stx') === 'u0' && field(v, 'sbtc') === 'u0', replacement);
  const seatAfter = ev('seat update funds after', seatBalance);
  tx('restore original 90: retire 100', DEP, LADDER, 'retire-band', [Cl.stringAscii('buy-band'), Cl.uint(100)]);
  tx('restore original 90: seat original', DEP, LADDER, 'seat-band', [cp(rung('buy', 90))]);
  tx('restore original 90: sync market', TY, MARKET, 'sync-seat', [cp(rung('buy', 90))], ok);
  ev('original 90 protected again', `(is-protected-x '${rung('buy', 90)})`, 'true');
  ev('final band count ten', '(get-band-count "buy-band")', 'u10', LADDER);
  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const result = await getSimulationResult(sid);
  fs.mkdirSync('simulations/results', { recursive: true });
  const prefix = `simulations/results/v6-2-ten-rungs-${sid}`;
  fs.writeFileSync(`${prefix}.raw.json`, JSON.stringify(result, null, 2));
  let i = 0, failures = 0, checks = 0;
  const verify = (label, actual, want) => {
    checks++;
    let success = false;
    try { success = typeof want === 'function' ? want(actual) : actual === want; } catch {}
    if (!success) failures++;
    console.log(`${success ? 'PASS' : 'FAIL'} ${label}: ${String(actual).slice(0, 240)}`);
  };
  for (const st of steps) {
    while (i < result.steps.length && !result.steps[i]?.Result?.Transaction && !result.steps[i]?.Result?.Eval) i++;
    st.rawStep = result.steps[i++]; st.actual = decode(st.rawStep, st.kind);
    verify(st.label, st.actual, st.want === observe ? s => !s.includes('ERROR') : st.want);
  }
  verify('treasury is included in conservation', treasury.actual, DEP);
  verify('failed helper dispatch restores entire user balance', rollbackAfter.actual, rollbackBefore.actual);
  verify('seat replacement preserves all deposited sBTC', seatAfter.actual, seatBefore.actual);
  for (const s of swaps) {
    s.matches = prints(s.st.rawStep).filter(p => p.includes('(event "match")'));
    verify(`${s.label}: exact price order`, s.matches.map(p => field(p, 'price')).join(','), s.expectedWalk.map(n => `u${price(s.side, n)}`).join(','));
    s.spent = String(num(s.fundsBefore.actual) - num(s.fundsAfter.actual));
    s.received = String(num(s.outAfter.actual) - num(s.outBefore.actual));
    verify(`${s.label}: received output`, s.received, s.rejected ? '0' : n => BigInt(n) > 0n);
    if (s.rejected) verify(`${s.label}: no input spent`, s.spent, '0');
  }
  for (const c of claims) {
    c.received = String(num(c.post.actual) - num(c.pre.actual));
    verify(`${c.side} member actually received claims`, c.received, n => BigInt(n) > 0n);
  }
  for (const a of ['stx', 'sbtc']) verify(`exact ${a} conservation across market, rungs, users and treasury`, after[a].actual, before[a].actual);
  const report = {
    simulation: `https://stxer.xyz/simulations/mainnet/${sid}`, market: MARKET,
    marketSourceHash: sha(live.source), rungSourceHashes: sourceHashes,
    oracleTimestamp: lz.ts, mid: String(mid), startingCycle: String(cycle),
    assumptions: { buyRungSats: String(RX), sellRungMicroStx: String(RY), forkOnlyCancelledOrders: residents, marketReferencesRetargeted: true },
    checks, failures,
    swaps: swaps.map(s => ({ label: s.label, side: s.side, offered: s.amount, spent: s.spent, received: s.received, input: s.input, output: s.output, limitSpread: s.limitSpread, result: s.st.actual, matches: s.matches })),
    claims: claims.map(c => ({ side: c.side, asset: c.asset, received: c.received })),
    fees: Object.fromEntries(['stx', 'sbtc'].map(a => [a, String(num(feeAfter[a].actual) - num(feeBefore[a].actual))])),
    snapshots: snapshots.map(s => ({ label: s.label, rows: s.rows.map(r => ({ side: r.side, spread: r.spread, state: r.state.actual })) })),
    assertions: steps.map(s => ({ label: s.label, result: s.actual })),
  };
  fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2));
  console.log(`\n${checks - failures}/${checks} passed; report ${prefix}.json`);
  if (failures) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
