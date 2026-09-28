// Fork only. Run: node simulations/verify-v6-3-errors-admin.js
// markets-sbtc-stx-jing-v6-3: the failure arms of every public function
// (asserts! / unwrap! / try!) that no other sim triggers, and every admin
// setter (refused + accepted). Every instance is the unmodified working-tree
// market source deployed as `err-admin-*`. Every refused call is wrapped in a
// before/after snapshot of the market (settings, cycle, totals, both books,
// escrow) and of every actor (wallets, live/parked positions, pending
// deposits / limits / readmits, stored orders): a refusal must move nothing.
//
// The fork is pinned at stacks block 8984873 (2026-09-14), the block the
// v6 lazer-paths sim c014c741 ran on, so the malformed-but-signed Lazer
// updates that sim fetched with a Pyth Pro key are fresh here:
//   btconly  feed 1 only                         -> ERR_FEED_MISSING u1023
//   btcusdc  feeds 1 + 7                         -> ERR_FEED_MISSING u1023
//   noconf   no confidence property              -> ERR_PRICE_UNCERTAIN u1004
//   nofut    no feedUpdateTimestamp property     -> ERR_FEED_TIMESTAMP_MISSING u1025
//   full     feeds 1 + 45, full properties (ts T0)
// Current updates (fetched now, two weeks later) are in the fork's future:
// the oracle and the market both accept them (age 0), so the ordinary flows
// use them. The fork clock is then moved with AdvanceBlocks:
//   T1 = T0 + 12: orders submitted at T1, `full` (at T0 <= T1) settles them
//      -> ERR_PRICE_BEFORE_ORDER u1032 on all six settle-* entries.
//   T2 = T0 + 80: the oracle still accepts `full` (publish + 80 >= now) but
//      the market needs publish > now - 80 -> ERR_STALE_PRICE u1003, on
//      the price gate (refresh-mid, swap, settle-*) and on the settlement.
//   T2 + 1: the oracle itself refuses it (its own u1002).
// Phase 4b (markets p..v): reprice / swap ERR_PARTIAL_FILL after a walk,
// ERR_TAKER_TOO_SMALL (a taker under 20 bps of its side), and a FULL side
// with no park candidate: the core's bump path refuses a size that is not
// bigger than the smallest maker (settle refunds it, swap aborts u1010) or
// fails its own transfer (a wallet holding only the rebate).
// Last, jing-core-v6 is paused: log-deposit-x / -y and log-settlement refuse
// (u5016), which reaches the deposit / swap / bump-path `try!` arms,
// settle-*-deposit's "deposit-error that is not QUEUE_FULL" re-raise and the
// settlement's log try! (the reprice walk dies there, before log-match).
//
// Unreachable arms (not asserted): ERR_SEATS_FULL (the ladder caps band
// seats at 49 < 50), ERR_ALREADY_SETTLED (the cycle advances in the settling
// tx), ERR_ZERO_PRICE, ERR_EXPO_MISMATCH (every Lazer feed at hand is expo
// -8), the conf-ratio ERR_PRICE_UNCERTAIN, the feed-y stale arms (Lazer
// stamps both feeds with the same second), the feed-y shape-feed try! (one
// property set per update), the second price read in reprice (same update,
// same tx), park-error re-raise, the as-max-len unwraps, transfers out of
// escrow, and every core log call that is not pause-gated (only log-deposit-x
// / -y, log-settlement and log-match are; log-match always runs after
// log-settlement in the same tx).
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, someCV, boolCV, listCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, getAddressFromPrivateKey, deserializeTransaction,
} from '@stacks/transactions';
import fs from 'node:fs';
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const LADDER = `${DEP}.jing-ladder-v1`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const FORK_BLOCK = 8984873;
const OLD_SIM = 'c014c74195d0c8967ae6627082aa1d3a';
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
      if (i < 6 && /block info|ECONNRESET|fetch failed|50[234]|busy|409/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      throw e;
    }
  }
}
// Evals and txs share the block's cost budget; the snapshots read a lot, so
// every eval starts a fresh tenure budget (TenureExtend resets all dimensions).
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
  if (amount === 0n) return;
  if (side === 'x') {
    await tx(`fund ${amount} sats`, WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, WHALES.y), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALES.y);
    const out = await retry(() => submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] }));
    check(`fund ${amount} uSTX`, decode({ Result: out.steps[0] }), '(ok true)');
  }
}
async function advanceTo(target) {
  // a synthetic block's time is its parent's burn time + the interval: step
  // once by 1s to learn the base, then land exactly on `target`
  const step = async (secs) => {
    const out = await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: secs } }] }));
    const blocks = out.steps[0]?.AdvanceBlocks?.Ok;
    if (!blocks) throw new Error(`AdvanceBlocks failed: ${JSON.stringify(out.steps[0]).slice(0, 300)}`);
    return Number(blocks[blocks.length - 1].block_time);
  };
  let now = await step(1);
  if (target > now) now = await step(target - now);
  return now;
}

// ------------------------------------------------------------- snapshot ---
// Everything a refused call could have moved: market settings, cycle,
// totals, both books, escrow and pending rebates; per actor wallets,
// positions, pending deposits / limits / readmits and stored orders.
async function snapshot(cid, whos) {
  const w = whos.map((a) => `{ s: (stx-get-balance '${a}), b: (unwrap-panic (contract-call? '${SBTC} get-balance '${a})), dy: (get-token-y-deposit (var-get current-cycle) '${a}), dx: (get-token-x-deposit (var-get current-cycle) '${a}), py: (get-token-y-parked '${a}), px: (get-token-x-parked '${a}), qy: (map-get? token-y-pending-deposits '${a}), qx: (map-get? token-x-pending-deposits '${a}), ly: (map-get? token-y-pending-limits '${a}), lx: (map-get? token-x-pending-limits '${a}), ry: (map-get? token-y-pending-readmits '${a}), rx: (map-get? token-x-pending-readmits '${a}), oy: (map-get? token-y-deposit-limits '${a}), ox: (map-get? token-x-deposit-limits '${a}) }`).join(' ');
  const code = `{ tr: (var-get treasury), op: (var-get operator), pz: (var-get paused), init: (var-get initialized), tx: (var-get token-x), ty: (var-get token-y), fx: (var-get feed-id-x), fy: (var-get feed-id-y), my: (var-get min-token-y-deposit), mx: (var-get min-token-x-deposit), ds: (var-get distance-slots), sp: (var-get seats-per-side), sx: (var-get seated-x), sy: (var-get seated-y), cy: (var-get current-cycle), tot: (get-cycle-totals (var-get current-cycle)), bky: (get-token-y-depositors (var-get current-cycle)), bkx: (get-token-x-depositors (var-get current-cycle)), st: (map-get? settlements (var-get current-cycle)), rb: (list (var-get pending-rebate-x) (var-get pending-rebate-y)), esc: (list (stx-get-balance '${cid}) (unwrap-panic (contract-call? '${SBTC} get-balance '${cid}))), w: (list ${w}) }`;
  const v = await evRaw(cid, code);
  if (!v.startsWith('(tuple')) throw new Error(`snapshot failed: ${v.slice(0, 300)}`);
  return v;
}
// A call that must be refused with `want` and move nothing.
async function refused(label, sender, cid, fn, args, want, whos) {
  const before = await snapshot(cid, whos);
  const got = await tx(label, sender, cid, fn, args, want);
  const after = await snapshot(cid, whos);
  check(`${label}: nothing moved`, after === before ? 'unchanged' : `CHANGED\n  before ${before}\n  after  ${after}`, 'unchanged');
  return got;
}
const isErr = (v) => /^\(err u\d+\)$/.test(v);

async function main() {
  // ---- old signed updates (fresh at FORK_BLOCK) ------------------------
  const old = await retry(() => getSimulationResult(OLD_SIM));
  const argOf = (i) => deserializeTransaction(old.steps[i].Transaction).payload.functionArgs[0].value;
  const OLD = { full: argOf(5), btconly: argOf(6), btcusdc: argOf(7), noconf: argOf(8), nofut: argOf(15) };
  const t0 = await lazerFeedTimes(OLD.full);
  const T0 = t0.at;
  console.log(`old full update: feeds at ${t0.x}/${t0.y}, envelope ${t0.envelope}`);

  // ---- fork + deploys --------------------------------------------------
  const names = ['err-admin-a', 'err-admin-fx', 'err-admin-u', 'err-admin-f', 'err-admin-p', 'err-admin-q', 'err-admin-r', 'err-admin-s', 'err-admin-t', 'err-admin-v'];
  const b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' }).useBlockHeight(FORK_BLOCK);
  for (const name of ['jing-core-v6', 'jing-ladder-v1']) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: source(name), clarity_version: ClarityVersion.Clarity5 });
  const market = source('markets-sbtc-stx-jing-v6-3');
  for (const name of names) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: market, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = await getSimulationResult(sid);
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy exact working-tree source', decode(st), ok);
  const A = `${DEP}.err-admin-a`, FX = `${DEP}.err-admin-fx`, UM = `${DEP}.err-admin-u`, F = `${DEP}.err-admin-f`;
  const clock0 = Number((await ev('fork clock', A, 'stacks-block-time', (v) => /^u\d+$/.test(v))).slice(1));
  check('old full update is fresh at the fork clock', String(T0 + 80 >= clock0 && T0 > clock0 - 80), 'true');
  const u = await fetchLazerUpdateAny();
  const P = u.px * 100_000_000n / u.py;
  const U = buf(u.hex);
  const tamperedHex = Buffer.from(u.hex.replace(/^0x/, ''), 'hex'); tamperedHex[20] ^= 0xff;
  const BAD = bufferCV(tamperedHex);
  const OB = Object.fromEntries(Object.entries(OLD).map(([k, v]) => [k, buf(v)]));
  const at = (k) => P * BigInt(k) / 1000n;
  console.log(`mid ${P}, current update ts ${u.ts}, fork clock ${clock0}, old update T0 ${T0}`);
  const MIN_X = 1000n, MIN_Y = 1_000_000n;
  const pairArgs = [traits.x, assets.x, traits.y, assets.y];
  let nk = 901;
  const fresh = () => mk(nk++);
  const T2R = fresh(); // new treasury
  const stranger = fresh();
  const OP2 = fresh();
  const depY = (amt, lim, spread = null, t = traits.y) => [uintCV(amt), uintCV(lim), spread == null ? noneCV() : someCV(uintCV(spread)), t, assets.y];
  const depX = (amt, lim, spread = null, t = traits.x) => [uintCV(amt), uintCV(lim), spread == null ? noneCV() : someCV(uintCV(spread)), t, assets.x];
  const swapArgs = (amt, lim, upd, depositX, tx_ = traits.x, ty_ = traits.y) => [uintCV(amt), uintCV(lim), upd, tx_, assets.x, ty_, assets.y, boolCV(depositX)];
  const repArgs = (lim, spread, upd, tx_ = traits.x, ty_ = traits.y) => [uintCV(lim), spread == null ? noneCV() : someCV(uintCV(spread)), upd, tx_, assets.x, ty_, assets.y];
  const swrArgs = (upd, tx_ = traits.x, ty_ = traits.y) => [upd, tx_, assets.x, ty_, assets.y];

  // ============================================== phase 1: initialize ==
  console.log('PHASE 1: initialize failure arms (err-admin-u)');
  {
    const who = [DEP, OP2, stranger];
    const init = (mx = MIN_X, my = MIN_Y) => [principal(UM), traits.x, traits.y, uintCV(mx), uintCV(my), uintCV(1), uintCV(45)];
    await refused('u: initialize before the core verified it -> core ERR_NOT_VERIFIED u5005 (register try!)', DEP, UM, 'initialize', init(), '(err u5005)', who);
    await tx('u: verify in core', DEP, CORE, 'set-verified-contract', [principal(UM)], '(ok true)');
    await refused('u: initialize by a non-operator -> u1008', stranger, UM, 'initialize', init(), '(err u1008)', who);
    await refused('u: initialize with min-x 0 -> ERR_ZERO_MIN_DEPOSIT u1019', DEP, UM, 'initialize', init(0n, MIN_Y), '(err u1019)', who);
    await refused('u: initialize with min-y 0 -> u1019', DEP, UM, 'initialize', init(MIN_X, 0n), '(err u1019)', who);
    await refused('u: set-operator by a non-operator -> u1008', stranger, UM, 'set-operator', [principal(stranger)], '(err u1008)', who);
    await tx('u: set-operator hands over to OP2', DEP, UM, 'set-operator', [principal(OP2)], '(ok true)');
    await ev('u: operator is OP2', UM, '(var-get operator)', OP2);
    await refused('u: OP2 is operator but not the core owner -> u1008 (second assert)', OP2, UM, 'initialize', init(), '(err u1008)', who);
    await refused('u: former operator refused by initialize -> u1008', DEP, UM, 'initialize', init(), '(err u1008)', who);
    await refused('u: former operator refused by set-operator -> u1008', DEP, UM, 'set-operator', [principal(DEP)], '(err u1008)', who);
    await tx('u: OP2 hands the operator back', OP2, UM, 'set-operator', [principal(DEP)], '(ok true)');
    await tx('u: initialize', DEP, UM, 'initialize', init(), '(ok true)');
    await refused('u: initialize twice -> ERR_ALREADY_INITIALIZED u1012', DEP, UM, 'initialize', init(), '(err u1012)', who);
    await ev('u: settings after initialize', UM, '(list (var-get min-token-x-deposit) (var-get min-token-y-deposit) (var-get feed-id-x) (var-get feed-id-y))', '(list u1000 u1000000 u1 u45)');
  }
  const [MP, MQ, MR, MS, MT, MV] = ['p', 'q', 'r', 's', 't', 'v'].map((k) => `${DEP}.err-admin-${k}`);
  for (const [cid, fx] of [[A, 1], [FX, 999], [F, 1], [MP, 1], [MQ, 1], [MR, 1], [MS, 1], [MT, 1], [MV, 1]]) {
    await tx(`${cid.split('.')[1]}: verify in core`, DEP, CORE, 'set-verified-contract', [principal(cid)], '(ok true)');
    await tx(`${cid.split('.')[1]}: initialize (feed-x ${fx})`, DEP, cid, 'initialize', [principal(cid), traits.x, traits.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(fx), uintCV(45)], '(ok true)');
  }

  // ================================================ phase 2: admin =====
  console.log('PHASE 2: admin setters on err-admin-a');
  {
    const who = [DEP, T2R, stranger];
    await refused('set-treasury by a non-operator -> u1008', stranger, A, 'set-treasury', [principal(stranger)], '(err u1008)', who);
    await refused('set-treasury to the market itself -> ERR_BAD_TREASURY u1033', DEP, A, 'set-treasury', [principal(A)], '(err u1033)', who);
    await tx('set-treasury to T2', DEP, A, 'set-treasury', [principal(T2R)], '(ok true)');
    await ev('treasury is T2', A, '(var-get treasury)', T2R);
    await refused('set-paused by a non-operator -> u1008', stranger, A, 'set-paused', [boolCV(true)], '(err u1008)', who);
    await refused('set-operator by a non-operator -> u1008', stranger, A, 'set-operator', [principal(stranger)], '(err u1008)', who);
    await refused('set-min-token-y-deposit by a non-operator -> u1008', stranger, A, 'set-min-token-y-deposit', [uintCV(5n)], '(err u1008)', who);
    await refused('set-min-token-y-deposit 0 -> u1019', DEP, A, 'set-min-token-y-deposit', [uintCV(0n)], '(err u1019)', who);
    await tx('set-min-token-y-deposit 2 STX', DEP, A, 'set-min-token-y-deposit', [uintCV(2_000_000n)], '(ok true)');
    await ev('min y is 2 STX', A, '(get min-token-y (get-min-deposits))', 'u2000000');
    await tx('set-min-token-y-deposit back to 1 STX', DEP, A, 'set-min-token-y-deposit', [uintCV(MIN_Y)], '(ok true)');
    await refused('set-min-token-x-deposit by a non-operator -> u1008', stranger, A, 'set-min-token-x-deposit', [uintCV(5n)], '(err u1008)', who);
    await refused('set-min-token-x-deposit 0 -> u1019', DEP, A, 'set-min-token-x-deposit', [uintCV(0n)], '(err u1019)', who);
    await tx('set-min-token-x-deposit 2000 sats', DEP, A, 'set-min-token-x-deposit', [uintCV(2000n)], '(ok true)');
    await ev('min x is 2000', A, '(get min-token-x (get-min-deposits))', 'u2000');
    await tx('set-min-token-x-deposit back to 1000', DEP, A, 'set-min-token-x-deposit', [uintCV(MIN_X)], '(ok true)');
    await refused('set-distance-slots by a non-operator -> u1008', stranger, A, 'set-distance-slots', [uintCV(5n)], '(err u1008)', who);
    await refused('set-distance-slots 51 -> ERR_QUEUE_FULL u1010', DEP, A, 'set-distance-slots', [uintCV(51n)], '(err u1010)', who);
    await tx('set-distance-slots 50 (the ceiling)', DEP, A, 'set-distance-slots', [uintCV(50n)], '(ok true)');
    await ev('distance-slots 50', A, '(get-distance-slots)', 'u50');
    await tx('set-distance-slots back to 10', DEP, A, 'set-distance-slots', [uintCV(10n)], '(ok true)');
    await tx('set-paused true', DEP, A, 'set-paused', [boolCV(true)], '(ok true)');
    await ev('paused', A, '(var-get paused)', 'true');
    await tx('set-paused false', DEP, A, 'set-paused', [boolCV(false)], '(ok true)');
    await tx('sync-seat-count (anyone) reads the ladder', stranger, A, 'sync-seat-count', [], '(ok u10)');
    await tx('prune-seats (anyone)', stranger, A, 'prune-seats', [], '(ok u10)');
    await refused('sync-seat of a principal that is no band rung -> ERR_NOT_A_SEAT u1028', stranger, A, 'sync-seat', [principal(stranger)], '(err u1028)', who);
    await refused('prune-cycles of the open cycle -> ERR_CYCLE_OPEN u1027', stranger, A, 'prune-cycles', [listCV([uintCV(0n)])], '(err u1027)', who);
  }

  // ======================================= phase 3: deposits / swaps ===
  console.log('PHASE 3: deposit / settle / cancel / withdraw / limit / swap / reprice arms on err-admin-a');
  const poor = fresh(), Y1 = fresh(), X1 = fresh(), X2 = fresh(), Y2 = fresh(), T = fresh(), R = fresh(), Rx = fresh(), X9 = fresh();
  const who3 = [DEP, T2R, stranger, poor, Y1, X1, X2, Y2, T, R, Rx, X9];
  await fund('y', Y1, 5_000_000n);
  await fund('x', X1, 5000n);
  await fund('y', Y2, 5_000_000n); await fund('x', X2, 5000n);
  await fund('y', T, 20_000_000n); await fund('x', T, 20_000n);
  await fund('y', R, 10_000n); await fund('x', Rx, 10n);
  await fund('x', X9, 5000n);
  // empty book: direct-path transfer failures
  await refused('deposit-x direct with an empty wallet -> err u1 (core transfer try!)', poor, A, 'deposit-token-x', depX(5000n, at(990)), '(err u1)', who3);
  await refused('deposit-y direct with an empty wallet -> err u1 (core stx-transfer try!)', poor, A, 'deposit-token-y', depY(5_000_000n, at(900)), '(err u1)', who3);
  // argument guards
  await refused('deposit-y spread 10000 -> ERR_BAD_SPREAD u1026', Y1, A, 'deposit-token-y', depY(5_000_000n, at(900), 10000n), '(err u1026)', who3);
  await refused('deposit-y limit 0 -> ERR_LIMIT_REQUIRED u1011', Y1, A, 'deposit-token-y', depY(5_000_000n, 0n), '(err u1011)', who3);
  await refused('deposit-y with the sBTC trait -> ERR_WRONG_TRAIT u1013', Y1, A, 'deposit-token-y', depY(5_000_000n, at(900), null, traits.x), '(err u1013)', who3);
  await refused('deposit-y below the minimum -> ERR_DEPOSIT_TOO_SMALL u1001', Y1, A, 'deposit-token-y', depY(999_999n, at(900)), '(err u1001)', who3);
  await refused('deposit-x spread 10000 -> u1026', X1, A, 'deposit-token-x', depX(5000n, at(990), 10000n), '(err u1026)', who3);
  await refused('deposit-x limit 0 -> u1011', X1, A, 'deposit-token-x', depX(5000n, 0n), '(err u1011)', who3);
  await refused('deposit-x with the wSTX trait -> u1013', X1, A, 'deposit-token-x', depX(5000n, at(990), null, traits.y), '(err u1013)', who3);
  await refused('deposit-x below the minimum -> u1001', X1, A, 'deposit-token-x', depX(999n, at(990)), '(err u1001)', who3);
  await tx('X1 ask 5000 @ 0.99 mid rests (direct)', X1, A, 'deposit-token-x', depX(5000n, at(990)), '(ok u5000)');
  await refused('deposit-y pending path with an empty wallet -> err u1 (pending stx-transfer try!)', poor, A, 'deposit-token-y', depY(5_000_000n, at(900)), '(err u1)', who3);
  await tx('Y1 bid 5 STX @ 0.9 mid submits (pending)', Y1, A, 'deposit-token-y', depY(5_000_000n, at(900)), '(ok u5000000)');
  await refused('Y1 deposits again while pending -> ERR_ALREADY_PENDING u1031', Y1, A, 'deposit-token-y', depY(5_000_000n, at(900)), '(err u1031)', who3);
  await refused('settle-token-y-deposit with nothing pending -> ERR_NOTHING_PENDING u1030', stranger, A, 'settle-token-y-deposit', [principal(stranger), U, traits.y, assets.y], '(err u1030)', who3);
  await refused('settle-token-y-deposit with the sBTC trait -> u1013', stranger, A, 'settle-token-y-deposit', [principal(Y1), U, traits.x, assets.y], '(err u1013)', who3);
  const badY = await refused('settle-token-y-deposit with a tampered update -> oracle error (price try!)', stranger, A, 'settle-token-y-deposit', [principal(Y1), BAD, traits.y, assets.y], isErr, who3);
  console.log(`   tampered update -> ${badY}`);
  await refused('settle-token-y-deposit with a BTC-only update -> ERR_FEED_MISSING u1023', stranger, A, 'settle-token-y-deposit', [principal(Y1), OB.btconly, traits.y, assets.y], '(err u1023)', who3);
  // paused
  await tx('pause a', DEP, A, 'set-paused', [boolCV(true)], '(ok true)');
  await refused('paused: deposit-y -> ERR_PAUSED u1007', Y2, A, 'deposit-token-y', depY(5_000_000n, at(900)), '(err u1007)', who3);
  await refused('paused: deposit-x -> u1007', X2, A, 'deposit-token-x', depX(5000n, at(1200)), '(err u1007)', who3);
  await refused('paused: settle-token-y-deposit -> u1007', stranger, A, 'settle-token-y-deposit', [principal(Y1), U, traits.y, assets.y], '(err u1007)', who3);
  await refused('paused: readmit-token-y -> u1007', stranger, A, 'readmit-token-y', [principal(Y1)], '(err u1007)', who3);
  await refused('paused: readmit-token-x -> u1007', stranger, A, 'readmit-token-x', [principal(X1)], '(err u1007)', who3);
  await refused('paused: settle-with-refresh -> u1007 (execute-settlement)', stranger, A, 'settle-with-refresh', swrArgs(U), '(err u1007)', who3);
  await refused('paused: swap y -> u1007 (via settle-with-refresh)', T, A, 'swap', swapArgs(5_000_000n, at(1050), U, false), '(err u1007)', who3);
  await refused('paused: set-paused by a non-operator still refused', stranger, A, 'set-paused', [boolCV(false)], '(err u1008)', who3);
  await tx('unpause a', DEP, A, 'set-paused', [boolCV(false)], '(ok true)');
  await tx('keeper settles Y1 (rests at 0.9 mid)', stranger, A, 'settle-token-y-deposit', [principal(Y1), U, traits.y, assets.y], '(ok u5000000)');
  // x pending arms
  await refused('deposit-x pending path with an empty wallet -> err u1', poor, A, 'deposit-token-x', depX(5000n, at(1200)), '(err u1)', who3);
  await tx('X2 ask 5000 @ 1.2 mid submits (pending)', X2, A, 'deposit-token-x', depX(5000n, at(1200)), '(ok u5000)');
  await refused('X2 deposits again while pending -> u1031', X2, A, 'deposit-token-x', depX(5000n, at(1200)), '(err u1031)', who3);
  await refused('settle-token-x-deposit with nothing pending -> u1030', stranger, A, 'settle-token-x-deposit', [principal(stranger), U, traits.x, assets.x], '(err u1030)', who3);
  await refused('settle-token-x-deposit with the wSTX trait -> u1013', stranger, A, 'settle-token-x-deposit', [principal(X2), U, traits.y, assets.x], '(err u1013)', who3);
  await refused('settle-token-x-deposit with a tampered update -> oracle error', stranger, A, 'settle-token-x-deposit', [principal(X2), BAD, traits.x, assets.x], isErr, who3);
  await tx('pause a', DEP, A, 'set-paused', [boolCV(true)], '(ok true)');
  await refused('paused: settle-token-x-deposit -> u1007', stranger, A, 'settle-token-x-deposit', [principal(X2), U, traits.x, assets.x], '(err u1007)', who3);
  await tx('unpause a', DEP, A, 'set-paused', [boolCV(false)], '(ok true)');
  // oracle payloads through the price gate and lazer-feeds
  await tx('refresh-mid with the current update', stranger, A, 'refresh-mid', [U], `(ok u${P})`);
  await refused('refresh-mid without confidence -> ERR_PRICE_UNCERTAIN u1004', stranger, A, 'refresh-mid', [OB.noconf], '(err u1004)', who3);
  await refused('refresh-mid without feedUpdateTimestamp -> ERR_FEED_TIMESTAMP_MISSING u1025', stranger, A, 'refresh-mid', [OB.nofut], '(err u1025)', who3);
  await refused('refresh-mid BTC only -> ERR_FEED_MISSING u1023 (feed y)', stranger, A, 'refresh-mid', [OB.btconly], '(err u1023)', who3);
  await refused('refresh-mid BTC + USDC -> u1023 (feed y)', stranger, A, 'refresh-mid', [OB.btcusdc], '(err u1023)', who3);
  await refused('refresh-mid tampered -> oracle error (lazer-feeds try!)', stranger, A, 'refresh-mid', [BAD], isErr, who3);
  await refused('fx: refresh-mid on a market whose feed-x (999) is not in the update -> u1023 (feed x)', stranger, FX, 'refresh-mid', [U], '(err u1023)', [stranger]);
  // settle-with-refresh
  await refused('settle-with-refresh with the wSTX trait as token-x -> u1013', stranger, A, 'settle-with-refresh', swrArgs(U, traits.y, traits.y), '(err u1013)', who3);
  await refused('settle-with-refresh with the sBTC trait as token-y -> u1013', stranger, A, 'settle-with-refresh', swrArgs(U, traits.x, traits.x), '(err u1013)', who3);
  await refused('settle-with-refresh BTC only -> u1023 (lazer-feeds try!)', stranger, A, 'settle-with-refresh', swrArgs(OB.btconly), '(err u1023)', who3);
  await refused('settle-with-refresh when the limits roll every bid out -> ERR_NOTHING_TO_SETTLE u1009 (post-filter)', stranger, A, 'settle-with-refresh', swrArgs(U), '(err u1009)', who3);
  // swap
  await refused('swap amount 0 -> u1001 (net 0)', T, A, 'swap', swapArgs(0n, at(1050), U, false), '(err u1001)', who3);
  await refused('swap limit 0 -> u1011', T, A, 'swap', swapArgs(5_000_000n, 0n, U, false), '(err u1011)', who3);
  await refused('swap y by a resting bidder -> ERR_HAS_RESTING_POSITION u1018 (live)', Y1, A, 'swap', swapArgs(5_000_000n, at(1050), U, false), '(err u1018)', who3);
  await refused('swap x by a resting asker -> u1018 (live)', X1, A, 'swap', swapArgs(5000n, at(950), U, true), '(err u1018)', who3);
  await refused('swap y whose net is under the minimum -> u1001', T, A, 'swap', swapArgs(1_000_000n, at(1050), U, false), '(err u1001)', who3);
  await refused('swap x whose net is under the minimum -> u1001', T, A, 'swap', swapArgs(1001n, at(950), U, true), '(err u1001)', who3);
  await refused('swap with a tampered update -> oracle error (price try!)', T, A, 'swap', swapArgs(5_000_000n, at(1050), BAD, false), isErr, who3);
  await refused('swap y with an empty wallet -> err u1 (rebate stx-transfer try!)', poor, A, 'swap', swapArgs(5_000_000n, at(1050), U, false), '(err u1)', who3);
  await refused('swap y with only the rebate in the wallet -> err u1 (deposit core try!)', R, A, 'swap', swapArgs(5_000_000n, at(1050), U, false), '(err u1)', who3);
  await refused('swap x with an empty wallet -> err u1 (rebate sBTC transfer try!)', poor, A, 'swap', swapArgs(5000n, at(950), U, true), '(err u1)', who3);
  await refused('swap x with only the rebate in the wallet -> err u1 (deposit core try!)', Rx, A, 'swap', swapArgs(5000n, at(950), U, true), '(err u1)', who3);
  await refused('swap x paying with the wSTX trait as token-x -> u1013 (settle-with-refresh; the wSTX pulled is rolled back)', T, A, 'swap', swapArgs(5000n, at(950), U, true, traits.y, traits.y), '(err u1013)', who3);
  // reprice-or-swap
  await refused('reprice-y limit 0 -> u1011', Y1, A, 'reprice-or-swap-token-y', repArgs(0n, null, U), '(err u1011)', who3);
  await refused('reprice-y spread 10000 -> u1026', Y1, A, 'reprice-or-swap-token-y', repArgs(at(950), 10000n, U), '(err u1026)', who3);
  await refused('reprice-y with no bid -> ERR_NOTHING_TO_WITHDRAW u1005', stranger, A, 'reprice-or-swap-token-y', repArgs(at(950), null, U), '(err u1005)', who3);
  await refused('reprice-y with the wSTX trait as token-x -> u1013', Y1, A, 'reprice-or-swap-token-y', repArgs(at(950), null, U, traits.y, traits.y), '(err u1013)', who3);
  await refused('reprice-y with the sBTC trait as token-y -> u1013', Y1, A, 'reprice-or-swap-token-y', repArgs(at(950), null, U, traits.x, traits.x), '(err u1013)', who3);
  await refused('reprice-y with a tampered update (asks resting) -> oracle error', Y1, A, 'reprice-or-swap-token-y', repArgs(at(950), null, BAD), isErr, who3);
  await refused('reprice-y crossing with an empty wallet -> err u1 (rebate stx-transfer try!)', Y1, A, 'reprice-or-swap-token-y', repArgs(at(1050), null, U), '(err u1)', who3);
  await refused('reprice-x limit 0 -> u1011', X1, A, 'reprice-or-swap-token-x', repArgs(0n, null, U), '(err u1011)', who3);
  await refused('reprice-x spread 10000 -> u1026', X1, A, 'reprice-or-swap-token-x', repArgs(at(950), 10000n, U), '(err u1026)', who3);
  await refused('reprice-x with no ask -> u1005', stranger, A, 'reprice-or-swap-token-x', repArgs(at(950), null, U), '(err u1005)', who3);
  await refused('reprice-x with the wSTX trait as token-x -> u1013', X1, A, 'reprice-or-swap-token-x', repArgs(at(950), null, U, traits.y, traits.y), '(err u1013)', who3);
  await refused('reprice-x with the sBTC trait as token-y -> u1013', X1, A, 'reprice-or-swap-token-x', repArgs(at(950), null, U, traits.x, traits.x), '(err u1013)', who3);
  await refused('reprice-x with a tampered update (bids resting) -> oracle error', X1, A, 'reprice-or-swap-token-x', repArgs(at(950), null, BAD), isErr, who3);
  // set limits
  await refused('set-token-y-limit 0 -> u1011', Y1, A, 'set-token-y-limit', [uintCV(0n), noneCV()], '(err u1011)', who3);
  await refused('set-token-y-limit spread 10000 -> u1026', Y1, A, 'set-token-y-limit', [uintCV(at(900)), someCV(uintCV(10000n))], '(err u1026)', who3);
  await refused('set-token-y-limit with no position -> u1005', stranger, A, 'set-token-y-limit', [uintCV(at(900)), noneCV()], '(err u1005)', who3);
  await refused('set-token-x-limit 0 -> u1011', X1, A, 'set-token-x-limit', [uintCV(0n), noneCV()], '(err u1011)', who3);
  await refused('set-token-x-limit spread 10000 -> u1026', X1, A, 'set-token-x-limit', [uintCV(at(990)), someCV(uintCV(10000n))], '(err u1026)', who3);
  await refused('set-token-x-limit with no position -> u1005', stranger, A, 'set-token-x-limit', [uintCV(at(990)), noneCV()], '(err u1005)', who3);
  await refused('settle-token-y-limit with nothing pending -> u1030', stranger, A, 'settle-token-y-limit', [principal(Y1), U], '(err u1030)', who3);
  await refused('settle-token-x-limit with nothing pending -> u1030', stranger, A, 'settle-token-x-limit', [principal(X1), U], '(err u1030)', who3);
  // cancel / withdraw
  await refused('cancel-y with the sBTC trait -> u1013', Y1, A, 'cancel-token-y-deposit', [traits.x, assets.y], '(err u1013)', who3);
  await refused('cancel-y with nothing to cancel -> u1005', stranger, A, 'cancel-token-y-deposit', [traits.y, assets.y], '(err u1005)', who3);
  await refused('cancel-x with the wSTX trait -> u1013', X1, A, 'cancel-token-x-deposit', [traits.y, assets.x], '(err u1013)', who3);
  await refused('cancel-x with nothing to cancel -> u1005', stranger, A, 'cancel-token-x-deposit', [traits.x, assets.x], '(err u1005)', who3);
  await refused('withdraw-y with the sBTC trait -> u1013', Y1, A, 'withdraw-token-y', [uintCV(1_000_000n), traits.x, assets.y], '(err u1013)', who3);
  await refused('withdraw-y with no position -> u1005', stranger, A, 'withdraw-token-y', [uintCV(1_000_000n), traits.y, assets.y], '(err u1005)', who3);
  await refused('withdraw-y amount 0 -> u1005', Y1, A, 'withdraw-token-y', [uintCV(0n), traits.y, assets.y], '(err u1005)', who3);
  await refused('withdraw-y the whole position -> ERR_USE_CANCEL u1024', Y1, A, 'withdraw-token-y', [uintCV(5_000_000n), traits.y, assets.y], '(err u1024)', who3);
  await refused('withdraw-y leaving less than the minimum -> u1001', Y1, A, 'withdraw-token-y', [uintCV(4_500_000n), traits.y, assets.y], '(err u1001)', who3);
  await refused('withdraw-x with the wSTX trait -> u1013', X1, A, 'withdraw-token-x', [uintCV(1000n), traits.y, assets.x], '(err u1013)', who3);
  await refused('withdraw-x with no position -> u1005', stranger, A, 'withdraw-token-x', [uintCV(1000n), traits.x, assets.x], '(err u1005)', who3);
  await refused('withdraw-x amount 0 -> u1005', X1, A, 'withdraw-token-x', [uintCV(0n), traits.x, assets.x], '(err u1005)', who3);
  await refused('withdraw-x the whole position -> u1024', X1, A, 'withdraw-token-x', [uintCV(5000n), traits.x, assets.x], '(err u1024)', who3);
  await refused('withdraw-x leaving less than the minimum -> u1001', X1, A, 'withdraw-token-x', [uintCV(4500n), traits.x, assets.x], '(err u1001)', who3);
  // readmit guards
  await refused('readmit-y with nothing parked -> ERR_NOTHING_TO_READMIT u1022', stranger, A, 'readmit-token-y', [principal(Y1)], '(err u1022)', who3);
  await refused('readmit-x with nothing parked -> u1022', stranger, A, 'readmit-token-x', [principal(X1)], '(err u1022)', who3);
  await refused('settle-token-y-readmit with nothing pending -> u1030', stranger, A, 'settle-token-y-readmit', [principal(Y1), U], '(err u1030)', who3);
  await refused('settle-token-x-readmit with nothing pending -> u1030', stranger, A, 'settle-token-x-readmit', [principal(X1), U], '(err u1030)', who3);
  // reprice paused, then crossing for real -> cycle 1, then prune
  await fund('y', Y1, 10_000n);
  await tx('pause a', DEP, A, 'set-paused', [boolCV(true)], '(ok true)');
  await refused('paused: reprice-y crossing -> u1007 (settle-with-refresh try!)', Y1, A, 'reprice-or-swap-token-y', repArgs(at(1050), null, U), '(err u1007)', who3);
  await tx('unpause a', DEP, A, 'set-paused', [boolCV(false)], '(ok true)');
  await tx('Y1 reprices through X1: settles cycle 0', Y1, A, 'reprice-or-swap-token-y', repArgs(at(1050), null, U), ok);
  await ev('cycle advanced to 1', A, '(var-get current-cycle)', 'u1');
  const tot0 = await ev('cycle 0 totals and books before prune', A, '{ t: (get-cycle-totals u0), ly: (len (get-token-y-depositors u0)), lx: (len (get-token-x-depositors u0)) }', (v) => v.startsWith('(tuple'));
  console.log(`   cycle 0 before prune: ${tot0}`);
  await refused('prune-cycles (list u1) -> u1027 (the open cycle)', stranger, A, 'prune-cycles', [listCV([uintCV(1n)])], '(err u1027)', who3);
  await refused('prune-cycles (list u1 u0) -> u1027 carried through the fold (try! acc)', stranger, A, 'prune-cycles', [listCV([uintCV(1n), uintCV(0n)])], '(err u1027)', who3);
  await tx('prune-cycles (list u0) -> (ok u1)', stranger, A, 'prune-cycles', [listCV([uintCV(0n)])], '(ok u1)');
  await ev('cycle 0 totals and books gone', A, '{ t: (get-cycle-totals u0), ly: (len (get-token-y-depositors u0)), lx: (len (get-token-x-depositors u0)) }', '(tuple (lx u0) (ly u0) (t (tuple (total-token-x u0) (total-token-y u0))))');
  const x1rest = await ev('X1 rolled a remainder into cycle 1', A, `(get-token-x-deposit u1 '${X1})`, (v) => /^u\d+$/.test(v) && BigInt(v.slice(1)) >= MIN_X);
  console.log(`   X1 remainder ${x1rest}`);
  // x-side rebate failure on err-admin-u: a resting bid B, an ask Ax with an empty wallet
  {
    const Bb = fresh(), Ax = fresh();
    const whoU = [DEP, stranger, Bb, Ax];
    await refused('u: settle-with-refresh on an empty cycle -> u1009 (raw totals)', stranger, UM, 'settle-with-refresh', swrArgs(U), '(err u1009)', whoU);
    await fund('y', Bb, 5_000_000n); await fund('x', Ax, 5000n);
    await tx('u: B bid @ 1.01 mid rests (direct)', Bb, UM, 'deposit-token-y', depY(5_000_000n, at(1010)), '(ok u5000000)');
    await tx('u: Ax ask @ 1.1 mid submits', Ax, UM, 'deposit-token-x', depX(5000n, at(1100)), '(ok u5000)');
    await tx('u: Ax settled (does not cross)', stranger, UM, 'settle-token-x-deposit', [principal(Ax), U, traits.x, assets.x], '(ok u5000)');
    await refused('u: reprice-x crossing with an empty wallet -> err u1 (rebate sBTC transfer try!)', Ax, UM, 'reprice-or-swap-token-x', repArgs(at(990), null, U), '(err u1)', whoU);
    await fund('x', Ax, 10n);
    await tx('pause u', DEP, UM, 'set-paused', [boolCV(true)], '(ok true)');
    await refused('u paused: reprice-x crossing -> u1007 (settle-with-refresh try!)', Ax, UM, 'reprice-or-swap-token-x', repArgs(at(990), null, U), '(err u1007)', whoU);
    await tx('unpause u', DEP, UM, 'set-paused', [boolCV(false)], '(ok true)');
  }

  // ======================================= phase 4: full side / parked ==
  console.log('PHASE 4: full side on err-admin-f (49 ladder seats): parked positions');
  const Q = fresh(), Qx = fresh(), Y3 = fresh(), X3 = fresh(), Ty = fresh(), Tx = fresh();
  const who4 = [DEP, stranger, Q, Qx, Y3, X3, Ty, Tx];
  await tx('ladder: 49 band seats per side', DEP, LADDER, 'set-max-band-per-side', [uintCV(49n)], '(ok true)');
  await tx('f: sync-seat-count -> 49', stranger, F, 'sync-seat-count', [], '(ok u49)');
  await tx('f: prune-seats -> 49', stranger, F, 'prune-seats', [], '(ok u49)');
  await fund('x', Qx, 4000n); await fund('y', Q, 5_000_000n);
  await fund('y', Y3, 5_000_000n); await fund('x', X3, 5000n);
  await fund('y', Ty, 10_000_000n); await fund('x', Tx, 10_000n);
  await tx('f: Qx pegged ask switched off (floor 1.5 mid) rests', Qx, F, 'deposit-token-x', depX(4000n, at(1500), 100n), '(ok u4000)');
  await tx('f: Q pegged bid switched off (cap 0.5 mid) submits', Q, F, 'deposit-token-y', depY(5_000_000n, at(500), 100n), '(ok u5000000)');
  await tx('f: Q settled onto the empty bid side', stranger, F, 'settle-token-y-deposit', [principal(Q), U, traits.y, assets.y], '(ok u5000000)');
  await tx('f: Y3 bid @ 0.9 mid submits on the full side', Y3, F, 'deposit-token-y', depY(5_000_000n, at(900)), '(ok u5000000)');
  await tx('f: Y3 settled, parks Q', stranger, F, 'settle-token-y-deposit', [principal(Y3), U, traits.y, assets.y], '(ok u5000000)');
  await tx('f: X3 ask @ 1.1 mid submits on the full side', X3, F, 'deposit-token-x', depX(5000n, at(1100)), '(ok u5000)');
  await tx('f: X3 settled, parks Qx', stranger, F, 'settle-token-x-deposit', [principal(X3), U, traits.x, assets.x], '(ok u5000)');
  await ev('f: Q and Qx parked, Y3 and X3 on the book', F, `(list (get-token-y-parked '${Q}) (get-token-x-parked '${Qx}) (get-token-y-deposit u0 '${Y3}) (get-token-x-deposit u0 '${X3}))`, '(list u5000000 u4000 u5000000 u5000)');
  await refused('f: swap y on the full side, nothing parkable -> ERR_QUEUE_FULL u1010 (park try!)', Ty, F, 'swap', swapArgs(5_000_000n, at(500), U, false), '(err u1010)', who4);
  await refused('f: swap x on the full side, nothing parkable -> u1010 (park try!)', Tx, F, 'swap', swapArgs(5000n, at(1500), U, true), '(err u1010)', who4);
  await refused('f: swap y by a parked bidder -> u1018 (parked)', Q, F, 'swap', swapArgs(5_000_000n, at(1050), U, false), '(err u1018)', who4);
  await refused('f: swap x by a parked asker -> u1018 (parked)', Qx, F, 'swap', swapArgs(4000n, at(950), U, true), '(err u1018)', who4);
  await refused('f: withdraw-y all of a parked position -> u1024', Q, F, 'withdraw-token-y', [uintCV(5_000_000n), traits.y, assets.y], '(err u1024)', who4);
  await tx('f: Q withdraws 1 STX from its parked position', Q, F, 'withdraw-token-y', [uintCV(1_000_000n), traits.y, assets.y], '(ok u4000000)');
  await tx('f: Qx withdraws 1000 sats from its parked position', Qx, F, 'withdraw-token-x', [uintCV(1000n), traits.x, assets.x], '(ok u3000)');
  await ev('f: parked amounts after the withdrawals', F, `(list (get-token-y-parked '${Q}) (get-token-x-parked '${Qx}))`, '(list u4000000 u3000)');

  // ===================== phase 4b: partial fills, small takers, bump path ==
  console.log('PHASE 4b: reprice/swap ERR_PARTIAL_FILL, ERR_TAKER_TOO_SMALL, the bump-path QUEUE_FULL');
  const act = {};
  for (const k of ['Xa', 'A2', 'A3', 'Yb', 'Tp', 'Yc', 'B2', 'B3', 'Xb', 'Tq', 'Xr', 'Yr', 'Tr', 'Ys', 'Xs', 'Ts', 'Xt', 'Yt', 'Zt', 'Tt', 'Rt', 'St', 'Yv', 'Xv', 'Zv', 'Tv', 'Rv', 'Sv']) act[k] = fresh();
  const whoP = [DEP, stranger, act.Xa, act.A2, act.A3, act.Yb, act.Tp];
  const whoQ = [DEP, stranger, act.Yc, act.B2, act.B3, act.Xb, act.Tq];
  const whoT = [DEP, stranger, act.Xt, act.Yt, act.Zt, act.Tt, act.Rt, act.St];
  const whoV = [DEP, stranger, act.Yv, act.Xv, act.Zv, act.Tv, act.Rv, act.Sv];
  // p: asks at 0.99 / 1.02 / 1.03 mid, a 50 STX bid at 0.9 mid
  for (const [k, amt, lim] of [['Xa', 1000n, 990], ['A2', 2000n, 1020], ['A3', 2000n, 1030]]) {
    await fund('x', act[k], amt);
  }
  await tx('p: Xa ask 1000 @ 0.99 mid rests', act.Xa, MP, 'deposit-token-x', depX(1000n, at(990)), '(ok u1000)');
  await tx('p: A2 ask 2000 @ 1.02 mid rests', act.A2, MP, 'deposit-token-x', depX(2000n, at(1020)), '(ok u2000)');
  await tx('p: A3 ask 2000 @ 1.03 mid rests', act.A3, MP, 'deposit-token-x', depX(2000n, at(1030)), '(ok u2000)');
  await fund('y', act.Yb, 50_100_000n);
  await tx('p: Yb bid 50 STX @ 0.9 mid submits', act.Yb, MP, 'deposit-token-y', depY(50_000_000n, at(900)), '(ok u50000000)');
  await tx('p: Yb settled', stranger, MP, 'settle-token-y-deposit', [principal(act.Yb), U, traits.y, assets.y], '(ok u50000000)');
  await refused('p: reprice-y fills Xa at mid, walks A2 + A3, 30+ STX left -> ERR_PARTIAL_FILL u1017 (cross-remainder try!)', act.Yb, MP, 'reprice-or-swap-token-y', repArgs(at(1050), null, U), '(err u1017)', whoP);
  await fund('y', act.Tp, 50_000_000n);
  await refused('p: swap y 50 STX over a 5000-sat book -> u1017', act.Tp, MP, 'swap', swapArgs(50_000_000n, at(1050), U, false), '(err u1017)', whoP);
  // q: bids at 1.01 / 0.98 / 0.97 mid, a 50000-sat ask at 1.1 mid
  for (const [k, lim] of [['Yc', 1010], ['B2', 980], ['B3', 970]]) {
    await fund('y', act[k], 5_000_000n);
    await tx(`q: ${k} bid 5 STX @ ${lim / 1000} mid rests`, act[k], MQ, 'deposit-token-y', depY(5_000_000n, at(lim)), '(ok u5000000)');
  }
  await fund('x', act.Xb, 50_100n);
  await tx('q: Xb ask 50000 @ 1.1 mid submits', act.Xb, MQ, 'deposit-token-x', depX(50_000n, at(1100)), '(ok u50000)');
  await tx('q: Xb settled', stranger, MQ, 'settle-token-x-deposit', [principal(act.Xb), U, traits.x, assets.x], '(ok u50000)');
  await refused('q: reprice-x fills Yc at mid, walks B2 + B3, sats left -> u1017 (cross-remainder try!)', act.Xb, MQ, 'reprice-or-swap-token-x', repArgs(at(950), null, U), '(err u1017)', whoQ);
  await fund('x', act.Tq, 50_000n);
  await refused('q: swap x 50000 sats over a 15 STX book -> u1017', act.Tq, MQ, 'swap', swapArgs(50_000n, at(950), U, true), '(err u1017)', whoQ);
  // r: a 700 STX bid above mid, asks above mid: a 1.1 STX taker is under 20 bps of its side
  await fund('x', act.Xr, 1000n); await fund('y', act.Yr, 700_000_000n); await fund('y', act.Tr, 2_000_000n);
  await tx('r: Xr ask 1000 @ 1.1 mid rests', act.Xr, MR, 'deposit-token-x', depX(1000n, at(1100)), '(ok u1000)');
  await tx('r: Yr bid 700 STX @ 1.01 mid submits', act.Yr, MR, 'deposit-token-y', depY(700_000_000n, at(1010)), '(ok u700000000)');
  await tx('r: Yr settled (no ask at or under mid)', stranger, MR, 'settle-token-y-deposit', [principal(act.Yr), U, traits.y, assets.y], '(ok u700000000)');
  await refused('r: swap y of 1.1 STX next to a 700 STX bid -> ERR_TAKER_TOO_SMALL u1020', act.Tr, MR, 'swap', swapArgs(1_102_205n, at(1050), U, false), '(err u1020)', [DEP, stranger, act.Xr, act.Yr, act.Tr]);
  // s: a 0.01 BTC ask under mid, bids under mid: a 1100-sat taker is under 20 bps
  await fund('y', act.Ys, 2_000_000n); await fund('x', act.Xs, 1_000_000n); await fund('x', act.Ts, 2000n);
  await tx('s: Ys bid 2 STX @ 0.9 mid rests', act.Ys, MS, 'deposit-token-y', depY(2_000_000n, at(900)), '(ok u2000000)');
  await tx('s: Xs ask 0.01 BTC @ 0.99 mid submits', act.Xs, MS, 'deposit-token-x', depX(1_000_000n, at(990)), '(ok u1000000)');
  await tx('s: Xs settled (no bid at or over mid)', stranger, MS, 'settle-token-x-deposit', [principal(act.Xs), U, traits.x, assets.x], '(ok u1000000)');
  await refused('s: swap x of 1100 sats next to a 0.01 BTC ask -> u1020', act.Ts, MS, 'swap', swapArgs(1100n, at(950), U, true), '(err u1020)', [DEP, stranger, act.Ys, act.Xs, act.Ts]);
  // t: y side FULL (49 seats) with one bid above mid: no park candidate, the core bumps the smallest only for a bigger size
  await tx('t: sync-seat-count -> 49', stranger, MT, 'sync-seat-count', [], '(ok u49)');
  await fund('x', act.Xt, 1000n); await fund('y', act.Yt, 10_000_000n); await fund('y', act.Zt, 5_000_000n); await fund('y', act.Tt, 6_000_000n); await fund('y', act.Rt, 30_060n);
  await tx('t: Xt ask 1000 @ 1.1 mid rests', act.Xt, MT, 'deposit-token-x', depX(1000n, at(1100)), '(ok u1000)');
  await tx('t: Yt bid 10 STX @ 1.01 mid submits', act.Yt, MT, 'deposit-token-y', depY(10_000_000n, at(1010)), '(ok u10000000)');
  await tx('t: Yt settled', stranger, MT, 'settle-token-y-deposit', [principal(act.Yt), U, traits.y, assets.y], '(ok u10000000)');
  await tx('t: Zt bid 5 STX @ 1.02 mid submits on the full side', act.Zt, MT, 'deposit-token-y', depY(5_000_000n, at(1020)), '(ok u5000000)');
  await tx('t: Zt settled: not bigger than Yt -> QUEUE_FULL in the core, refunded', stranger, MT, 'settle-token-y-deposit', [principal(act.Zt), U, traits.y, assets.y], '(ok u5000000)');
  await ev('t: Zt refunded, not on the book, Yt kept', MT, `(list (stx-get-balance '${act.Zt}) (get-token-y-deposit u0 '${act.Zt}) (get-token-y-deposit u0 '${act.Yt}))`, '(list u5000000 u0 u10000000)');
  await refused('t: swap y 5 STX on the full side, not bigger than Yt -> u1010 (deposit core try!)', act.Tt, MT, 'swap', swapArgs(5_010_000n, at(1050), U, false), '(err u1010)', whoT);
  await refused('t: swap y 15 STX bumps Yt but the wallet holds only the rebate -> err u1 (bump-path stx-transfer)', act.Rt, MT, 'swap', swapArgs(15_030_000n, at(1050), U, false), '(err u1)', whoT);
  // v: x side FULL with one ask under mid
  await tx('v: sync-seat-count -> 49', stranger, MV, 'sync-seat-count', [], '(ok u49)');
  await fund('y', act.Yv, 2_000_000n); await fund('x', act.Xv, 10_000n); await fund('x', act.Zv, 5000n); await fund('x', act.Tv, 6000n); await fund('x', act.Rv, 30n);
  await tx('v: Yv bid 2 STX @ 0.9 mid rests', act.Yv, MV, 'deposit-token-y', depY(2_000_000n, at(900)), '(ok u2000000)');
  await tx('v: Xv ask 10000 @ 0.99 mid submits', act.Xv, MV, 'deposit-token-x', depX(10_000n, at(990)), '(ok u10000)');
  await tx('v: Xv settled', stranger, MV, 'settle-token-x-deposit', [principal(act.Xv), U, traits.x, assets.x], '(ok u10000)');
  await tx('v: Zv ask 5000 @ 0.98 mid submits on the full side', act.Zv, MV, 'deposit-token-x', depX(5000n, at(980)), '(ok u5000)');
  await tx('v: Zv settled: not bigger than Xv -> QUEUE_FULL in the core, refunded', stranger, MV, 'settle-token-x-deposit', [principal(act.Zv), U, traits.x, assets.x], '(ok u5000)');
  await ev('v: Zv refunded, not on the book, Xv kept', MV, `(list (unwrap-panic (contract-call? '${SBTC} get-balance '${act.Zv})) (get-token-x-deposit u0 '${act.Zv}) (get-token-x-deposit u0 '${act.Xv}))`, '(list u5000 u0 u10000)');
  await refused('v: swap x 5000 sats on the full side, not bigger than Xv -> u1010', act.Tv, MV, 'swap', swapArgs(5010n, at(950), U, true), '(err u1010)', whoV);
  await refused('v: swap x 15000 sats bumps Xv but the wallet holds only the rebate -> err u1 (bump-path transfer)', act.Rv, MV, 'swap', swapArgs(15_030n, at(950), U, true), '(err u1)', whoV);

  // ================================= phase 5: clock T1, PRICE_BEFORE_ORDER ==
  const T1 = T0 + 12;
  const c1 = await advanceTo(T1);
  check(`clock advanced to T1 = T0 + 12`, String(c1), String(T1));
  await ev('stacks-block-time is T1', A, 'stacks-block-time', `u${T1}`);
  console.log('PHASE 5: orders submitted at T1, settled with the update from T0');
  // readmits (f)
  await tx('f: readmit Q (anyone)', stranger, F, 'readmit-token-y', [principal(Q)], '(ok u4000000)');
  await refused('f: readmit Q again -> u1031', stranger, F, 'readmit-token-y', [principal(Q)], '(err u1031)', who4);
  await tx('f: readmit Qx', stranger, F, 'readmit-token-x', [principal(Qx)], '(ok u3000)');
  await refused('f: settle-token-x-readmit with a tampered update -> oracle error', stranger, F, 'settle-token-x-readmit', [principal(Qx), BAD], isErr, who4);
  await refused('f: readmit Qx again -> u1031', stranger, F, 'readmit-token-x', [principal(Qx)], '(err u1031)', who4);
  await refused('f: settle-token-y-readmit with a tampered update -> oracle error', stranger, F, 'settle-token-y-readmit', [principal(Q), BAD], isErr, who4);
  await tx('pause f', DEP, F, 'set-paused', [boolCV(true)], '(ok true)');
  await refused('f paused: settle-token-y-readmit -> u1007', stranger, F, 'settle-token-y-readmit', [principal(Q), U], '(err u1007)', who4);
  await refused('f paused: settle-token-x-readmit -> u1007', stranger, F, 'settle-token-x-readmit', [principal(Qx), U], '(err u1007)', who4);
  await tx('unpause f', DEP, F, 'set-paused', [boolCV(false)], '(ok true)');
  await refused('f: settle-token-y-readmit with a print older than the readmit -> ERR_PRICE_BEFORE_ORDER u1032', stranger, F, 'settle-token-y-readmit', [principal(Q), OB.full], '(err u1032)', who4);
  await refused('f: settle-token-x-readmit with an older print -> u1032', stranger, F, 'settle-token-x-readmit', [principal(Qx), OB.full], '(err u1032)', who4);
  // deposits and limits (a): X1 rests (cycle 1), y side empty
  const Y5 = fresh(), X4 = fresh(), Y6 = fresh();
  const who5 = [DEP, T2R, stranger, X1, Y1, Y5, X4, Y6];
  await fund('y', Y5, 5_000_000n); await fund('x', X4, 5000n); await fund('y', Y6, 5_000_000n);
  await tx('a: Y5 bid @ 0.9 mid submits at T1', Y5, A, 'deposit-token-y', depY(5_000_000n, at(900)), '(ok u5000000)');
  await refused('a: settle-token-y-deposit with an older print -> u1032', stranger, A, 'settle-token-y-deposit', [principal(Y5), OB.full, traits.y, assets.y], '(err u1032)', who5);
  await tx('a: Y5 settled with the current update', stranger, A, 'settle-token-y-deposit', [principal(Y5), U, traits.y, assets.y], '(ok u5000000)');
  await tx('a: X4 ask @ 1.2 mid submits at T1', X4, A, 'deposit-token-x', depX(5000n, at(1200)), '(ok u5000)');
  await refused('a: settle-token-x-deposit with an older print -> u1032', stranger, A, 'settle-token-x-deposit', [principal(X4), OB.full, traits.x, assets.x], '(err u1032)', who5);
  await tx('a: Y5 new limit (asks resting -> pending)', Y5, A, 'set-token-y-limit', [uintCV(at(880)), noneCV()], '(ok false)');
  await refused('a: settle-token-y-limit with a tampered update -> oracle error', stranger, A, 'settle-token-y-limit', [principal(Y5), BAD], isErr, who5);
  await refused('a: settle-token-y-limit with an older print -> u1032', stranger, A, 'settle-token-y-limit', [principal(Y5), OB.full], '(err u1032)', who5);
  await tx('a: X1 new limit (bids resting -> pending)', X1, A, 'set-token-x-limit', [uintCV(at(995)), noneCV()], '(ok false)');
  await refused('a: settle-token-x-limit with a tampered update -> oracle error', stranger, A, 'settle-token-x-limit', [principal(X1), BAD], isErr, who5);
  await refused('a: settle-token-x-limit with an older print -> u1032', stranger, A, 'settle-token-x-limit', [principal(X1), OB.full], '(err u1032)', who5);
  await tx('a: Y6 bid @ 0.9 mid submits at T1 (kept pending)', Y6, A, 'deposit-token-y', depY(5_000_000n, at(900)), '(ok u5000000)');

  // ======================================== phase 6: clock T2, stale ==
  const T2 = T0 + 80;
  const c2 = await advanceTo(T2);
  check('clock advanced to T2 = T0 + 80', String(c2), String(T2));
  console.log('PHASE 6: the T0 update is exactly 80s old: the oracle accepts it, the market does not');
  await refused('a: refresh-mid at age 80 -> ERR_STALE_PRICE u1003 (price gate, feed x)', stranger, A, 'refresh-mid', [OB.full], '(err u1003)', who5);
  await refused('a: swap at age 80 -> u1003', T, A, 'swap', swapArgs(5_000_000n, at(1050), OB.full, false), '(err u1003)', [...who5, T]);
  await refused('a: settle-token-y-deposit at age 80 -> u1003', stranger, A, 'settle-token-y-deposit', [principal(Y6), OB.full, traits.y, assets.y], '(err u1003)', who5);
  await ev('a: both sides rest above the minimum (settlement reaches the price checks)', A, '(get-cycle-totals (var-get current-cycle))', (v) => { const n = [...v.matchAll(/u(\d+)/g)].map((m) => BigInt(m[1])); return n[0] >= MIN_X && n[1] >= MIN_Y; });
  await refused('a: settle-with-refresh at age 80 -> u1003 (execute-settlement freshness)', stranger, A, 'settle-with-refresh', swrArgs(OB.full), '(err u1003)', who5);
  await advanceTo(T2 + 1);
  const oracleStale = await refused('a: refresh-mid at age 81 -> the oracle refuses it first', stranger, A, 'refresh-mid', [OB.full], isErr, who5);
  check('oracle staleness code differs from the market one', String(oracleStale !== '(err u1003)'), 'true');
  console.log(`   oracle at age 81 -> ${oracleStale}`);

  // ===================================== phase 7: jing-core-v6 paused ==
  console.log('PHASE 7: jing-core-v6 paused: log-deposit-x / -y refuse');
  const Dy = fresh(), Dx = fresh(), Sy = fresh(), Sx = fresh();
  await fund('y', Dy, 5_000_000n); await fund('x', Dx, 5000n); await fund('y', Sy, 10_000_000n); await fund('x', Sx, 10_000n);
  await tx('core: pause', DEP, CORE, 'pause', [], '(ok true)');
  await refused('fx: deposit-y direct -> core ERR_PAUSED u5016 (deposit core try!)', Dy, FX, 'deposit-token-y', depY(5_000_000n, at(900)), '(err u5016)', [Dy, Dx]);
  await refused('fx: deposit-x direct -> u5016', Dx, FX, 'deposit-token-x', depX(5000n, at(1100)), '(err u5016)', [Dy, Dx]);
  await refused('a: settle-token-y-deposit -> u5016 re-raised (deposit-error is not QUEUE_FULL)', stranger, A, 'settle-token-y-deposit', [principal(Y6), U, traits.y, assets.y], '(err u5016)', who5);
  await refused('a: settle-token-x-deposit -> u5016 re-raised', stranger, A, 'settle-token-x-deposit', [principal(X4), U, traits.x, assets.x], '(err u5016)', who5);
  await refused('a: swap y -> u5016 (deposit core try!)', Sy, A, 'swap', swapArgs(5_000_000n, at(1050), U, false), '(err u5016)', [...who5, Sy]);
  await refused('a: swap x -> u5016 (deposit core try!)', Sx, A, 'swap', swapArgs(5000n, at(950), U, true), '(err u5016)', [...who5, Sx]);

  // log-match is pause-gated too: a reprice whose walk reaches a maker
  await refused('p: reprice-y, the first walk fill cannot log its match -> u5016 (execute-fill -> walk step -> cross-remainder try!)', act.Yb, MP, 'reprice-or-swap-token-y', repArgs(at(1050), null, U), '(err u5016)', whoP);
  await refused('q: reprice-x, same on the bid walk -> u5016', act.Xb, MQ, 'reprice-or-swap-token-x', repArgs(at(950), null, U), '(err u5016)', whoQ);
  await fund('y', act.St, 15_030_000n); await fund('x', act.Sv, 15_030n);
  await refused('t: swap y bumping Yt -> log-deposit-y u5016 (bump path)', act.St, MT, 'swap', swapArgs(15_030_000n, at(1050), U, false), '(err u5016)', whoT);
  await refused('v: swap x bumping Xv -> log-deposit-x u5016 (bump path)', act.Sv, MV, 'swap', swapArgs(15_030n, at(950), U, true), '(err u5016)', whoV);

  console.log(`${passed}/${checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
