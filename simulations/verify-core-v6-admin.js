// Fork only. Run: node simulations/verify-core-v6-admin.js
// jing-core-v6: the core-owned administration surface, from the unmodified
// working-tree source deployed as `jing-core-v6`:
//   pause / unpause (owner-only, TIMELOCK_BURN_BLOCKS = 144 burn blocks from
//   paused-at, ERR_NOT_PAUSED when not paused, a pause while paused restarts
//   the timelock), propose-owner / accept-owner (two-step, `none` cancels,
//   no cooldown in the source: the nominee may accept at once),
//   set-verified-contract / register (contract-hash? match, one verification
//   per principal, one registration per caller) and every read-only getter.
// Every getter is read inside a transaction through `coreadmprobe-a` so the
// stxer trace records it. Every refused call is wrapped in a before/after
// snapshot of the core (owner, pending owner, paused flag, paused-at,
// eligibility, verified hashes, registrations, equity): a refusal must move
// nothing.
//
// Contracts: jing-core-v6 and jing-ladder-v1 (working tree, the market needs
// the ladder to deploy), `coreadm-market` and `coreadm-market2` (the v6-3
// market, byte-identical), `coreadm-market-mod` (the v6-3 market plus one
// trailing comment: a different contract-hash?), and three probes:
// `coreadmprobe-a` / `coreadmprobe-c` (same code) and `coreadmprobe-b` (one
// comment more: a different hash).
import {
  ClarityVersion, uintCV, contractPrincipalCV, standardPrincipalCV, noneCV, someCV,
  deserializeCV, cvToString, getAddressFromPrivateKey,
} from '@stacks/transactions';
import fs from 'node:fs';
import { SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract } from 'stxer';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const FORK_BLOCK = 8984873;
const TIMELOCK = 144;
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
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
// n synthetic bitcoin blocks (one stacks block each); returns the new burn height
async function advanceBurn(n) {
  const out = await retry(() => submitSimulationSteps(sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 600 } }] }));
  const blocks = out.steps[0]?.AdvanceBlocks?.Ok;
  if (!blocks) throw new Error(`AdvanceBlocks failed: ${JSON.stringify(out.steps[0]).slice(0, 300)}`);
  return Number(blocks[blocks.length - 1].burn_height);
}

// ------------------------------------------------------------- contracts --
const PROBE = `;; coreadmprobe: reads every jing-core-v6 getter inside a transaction
(define-public (read (c principal) (who principal) (token principal))
  (ok {
    owner: (contract-call? .jing-core-v6 get-contract-owner),
    pending: (contract-call? .jing-core-v6 get-pending-owner),
    paused: (contract-call? .jing-core-v6 is-paused),
    paused-at: (contract-call? .jing-core-v6 get-paused-at),
    eligible: (contract-call? .jing-core-v6 get-unpause-eligible-at),
    verified: (contract-call? .jing-core-v6 is-verified-contract c),
    hash: (contract-call? .jing-core-v6 get-verified-hash c),
    registered: (contract-call? .jing-core-v6 is-registered c),
    equity: (contract-call? .jing-core-v6 get-token-equity token who),
    total: (contract-call? .jing-core-v6 get-total-token-equity token),
    balance: (contract-call? .jing-core-v6 get-balance who),
    burn: burn-block-height,
  })
)
(define-public (reg (canonical principal))
  (contract-call? .jing-core-v6 register canonical)
)
(define-public (dep (token principal) (amount uint))
  (contract-call? .jing-core-v6 log-deposit token amount)
)
`;
const PROBE_B = `${PROBE};; variant b: one comment more, a different contract-hash?\n`;

// the cvToString form of a Clarity tuple (keys sorted, as Clarity stores them)
const tuple = (o) => `(tuple ${Object.keys(o).sort().map((k) => `(${k} ${o[k]})`).join(' ')})`;

async function main() {
  const b = SimulationBuilder.new({ stacksNodeAPI: 'http://77.42.3.101/stacks-api' }).useBlockHeight(FORK_BLOCK);
  const coreSrc = source('jing-core-v6');
  const market = source('markets-sbtc-stx-jing-v6-3');
  const deploys = [
    ['jing-core-v6', coreSrc], ['jing-ladder-v1', source('jing-ladder-v1')],
    ['coreadm-market', market], ['coreadm-market2', market], ['coreadm-market-mod', `${market}\n;; coreadm: modified copy\n`],
    ['coreadmprobe-a', PROBE], ['coreadmprobe-b', PROBE_B], ['coreadmprobe-c', PROBE],
  ];
  for (const [name, code] of deploys) b.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const setup = await getSimulationResult(sid);
  for (const st of setup.steps.filter((s) => s.Result?.Transaction)) check('deploy', decode(st), ok);

  const M = `${DEP}.coreadm-market`, M2 = `${DEP}.coreadm-market2`, MOD = `${DEP}.coreadm-market-mod`;
  const PA = `${DEP}.coreadmprobe-a`, PB = `${DEP}.coreadmprobe-b`, PC = `${DEP}.coreadmprobe-c`;
  const NOPE = `${DEP}.coreadm-nope`;
  let nk = 701;
  const fresh = () => mk(nk++);
  const stranger = fresh(), NEW = fresh(), NEW2 = fresh();
  const tracked = [M, M2, MOD, PA, PB, PC];

  // Everything a refused admin call could have moved.
  async function snapshot() {
    const code = `{ o: (var-get contract-owner), p: (var-get pending-owner), z: (var-get paused), za: (var-get paused-at), el: (get-unpause-eligible-at), v: (list ${tracked.map((c) => `(map-get? verified-contracts '${c})`).join(' ')}), r: (list ${tracked.map((c) => `(map-get? registered-contracts '${c})`).join(' ')}), e: (map-get? token-equity { token: '${SBTC}, owner: '${PA} }), t: (map-get? total-token-equity '${SBTC}) }`;
    const v = await evRaw(CORE, code);
    if (!v.startsWith('(tuple')) throw new Error(`snapshot failed: ${v.slice(0, 300)}`);
    return v;
  }
  async function refused(label, sender, cid, fn, args, want) {
    const before = await snapshot();
    const got = await tx(label, sender, cid, fn, args, want);
    const after = await snapshot();
    check(`${label}: nothing moved`, after === before ? 'unchanged' : `CHANGED\n  before ${before}\n  after  ${after}`, 'unchanged');
    return got;
  }
  // all getters through the probe, inside a transaction; returns the tuple
  async function read(label, c, who, token, want) {
    return tx(`getters: ${label}`, stranger, PA, 'read', [principal(c), principal(who), principal(token)], `(ok ${tuple(want)})`);
  }
  const burnNow = async () => {
    const r = await retry(() => callContract(sid, { sender: stranger, contract: PA, functionName: 'read', functionArgs: [principal(M), principal(PA), principal(SBTC)], fee: 0 }));
    const m = /\(burn u(\d+)\)/.exec(r.result ?? ''); if (!m) throw new Error(`burn read failed: ${JSON.stringify(r).slice(0, 300)}`);
    return Number(m[1]);
  };
  const hashOf = async (c) => (await evRaw(CORE, `(unwrap-panic (contract-hash? '${c}))`));
  const H = { M: await hashOf(M), M2: await hashOf(M2), MOD: await hashOf(MOD), PA: await hashOf(PA), PB: await hashOf(PB), PC: await hashOf(PC) };
  check('contract-hash?: byte-identical market copies hash equal', String(H.M === H.M2), 'true');
  check('contract-hash?: the modified market hashes differently', String(H.M !== H.MOD), 'true');
  check('contract-hash?: probe a and c equal, b differs', String(H.PA === H.PC && H.PA !== H.PB), 'true');
  check('contract-hash? values are 32-byte buffers', Object.values(H).every((h) => /^0x[0-9a-f]{64}$/.test(h)) ? 'yes' : JSON.stringify(H), 'yes');

  // ============================================= phase 1: initial getters ==
  console.log('PHASE 1: initial state through every getter');
  const B0 = await burnNow();
  const base = { owner: DEP, pending: 'none', paused: 'false', 'paused-at': 'u0', eligible: `u${TIMELOCK}`, verified: 'false', hash: 'none', registered: 'false', equity: 'u0', total: 'u0', balance: '(ok u0)', burn: `u${B0}` };
  await read('fresh core', M, PA, SBTC, base);
  await ev('eval agrees: owner / pending / paused', CORE, '(list (get-contract-owner) (get-contract-owner))', `(list ${DEP} ${DEP})`);

  // ============================================= phase 2: verification ====
  console.log('PHASE 2: set-verified-contract / register');
  await refused('initialize before the market is verified -> core register ERR_NOT_VERIFIED u5005 (market try!)', DEP, M, 'initialize', initArgs(M), '(err u5005)');
  await ev('market not initialized after the refusal', M, '(var-get initialized)', 'false');
  await refused('set-verified by a non-owner -> ERR_NOT_AUTHORIZED u5001', stranger, CORE, 'set-verified-contract', [principal(M)], '(err u5001)');
  await refused('set-verified of a contract that does not exist -> ERR_INVALID_CONTRACT_HASH u5002', DEP, CORE, 'set-verified-contract', [principal(NOPE)], '(err u5002)');
  await refused('set-verified of a standard principal -> u5002', DEP, CORE, 'set-verified-contract', [principal(stranger)], '(err u5002)');
  await refused('set-verified by a non-owner of a missing contract -> u5002 (the hash is read before the owner check)', stranger, CORE, 'set-verified-contract', [principal(NOPE)], '(err u5002)');
  await tx('owner verifies coreadm-market', DEP, CORE, 'set-verified-contract', [principal(M)], '(ok true)');
  await read('market verified, not registered', M, PA, SBTC, { ...base, verified: 'true', hash: `(some ${H.M})`, burn: `u${B0}` });
  await refused('set-verified twice -> ERR_ALREADY_REGISTERED u5003 (no overwrite)', DEP, CORE, 'set-verified-contract', [principal(M)], '(err u5003)');
  await refused('set-verified twice by a non-owner -> u5001 (owner check before the duplicate check)', stranger, CORE, 'set-verified-contract', [principal(M)], '(err u5001)');

  await refused('register called directly by a wallet -> u5002 (contract-caller has no contract hash)', stranger, CORE, 'register', [principal(M)], '(err u5002)');
  await refused('register by the owner wallet -> u5002 too', DEP, CORE, 'register', [principal(M)], '(err u5002)');
  await refused('probe b registers under an unverified canonical -> ERR_NOT_VERIFIED u5005', stranger, PB, 'reg', [principal(PB)], '(err u5005)');
  await refused('probe b registers under the verified market -> ERR_HASH_MISMATCH u5006', stranger, PB, 'reg', [principal(M)], '(err u5006)');
  await refused('modified market initialize under canonical coreadm-market -> u5006 (market try!)', DEP, MOD, 'initialize', initArgs(M), '(err u5006)');
  await ev('modified market not initialized after the refusal', MOD, '(var-get initialized)', 'false');

  await tx('coreadm-market initialize -> register(canonical itself)', DEP, M, 'initialize', initArgs(M), '(ok true)');
  await read('market registered', M, PA, SBTC, { ...base, verified: 'true', hash: `(some ${H.M})`, registered: 'true', burn: `u${B0}` });
  await refused('double register: market initialize again -> market ERR_ALREADY_INITIALIZED u1012 (before core)', DEP, M, 'initialize', initArgs(M), '(err u1012)');
  await tx('coreadm-market2 (byte-identical copy, not itself verified) registers under canonical coreadm-market', DEP, M2, 'initialize', initArgs(M), '(ok true)');
  await read('market2 registered, not verified itself', M2, PA, SBTC, { ...base, registered: 'true', burn: `u${B0}` });

  await tx('owner verifies probe a', DEP, CORE, 'set-verified-contract', [principal(PA)], '(ok true)');
  await tx('probe a registers itself', stranger, PA, 'reg', [principal(PA)], '(ok true)');
  await refused('probe a registers again -> ERR_ALREADY_REGISTERED u5003', stranger, PA, 'reg', [principal(PA)], '(err u5003)');
  await refused('probe a registers again under canonical market -> u5006 (hash check before the duplicate check)', stranger, PA, 'reg', [principal(M)], '(err u5006)');
  await tx('probe c (same code as a) registers under canonical probe a', stranger, PC, 'reg', [principal(PA)], '(ok true)');
  await refused('probe c again -> u5003', stranger, PC, 'reg', [principal(PA)], '(err u5003)');
  await tx('probe a logs a 1234-sat deposit (gives the equity getters a value)', stranger, PA, 'dep', [principal(SBTC), uintCV(1234)], '(ok true)');
  await read('probe a: verified, registered, equity 1234', PA, PA, SBTC, { ...base, verified: 'true', hash: `(some ${H.PA})`, registered: 'true', equity: 'u1234', total: 'u1234', balance: '(ok u1234)', burn: `u${B0}` });
  await read('equity of an unknown owner / token', PB, stranger, STX, { ...base, burn: `u${B0}` });

  // ============================================= phase 3: pause / unpause ==
  console.log('PHASE 3: pause / unpause and the 144-burn-block timelock');
  const reg = { verified: 'true', hash: `(some ${H.PA})`, registered: 'true', equity: 'u1234', total: 'u1234', balance: '(ok u1234)' };
  await refused('unpause while not paused -> ERR_NOT_PAUSED u5017', DEP, CORE, 'unpause', [], '(err u5017)');
  await refused('unpause by a non-owner while not paused -> u5001 (owner check first)', stranger, CORE, 'unpause', [], '(err u5001)');
  await refused('pause by a non-owner -> u5001', stranger, CORE, 'pause', [], '(err u5001)');
  const P1 = await burnNow();
  await tx('owner pauses', DEP, CORE, 'pause', [], '(ok true)');
  await read('paused at the current burn height', PA, PA, SBTC, { ...base, ...reg, paused: 'true', 'paused-at': `u${P1}`, eligible: `u${P1 + TIMELOCK}`, burn: `u${P1}` });
  await refused('paused: log-deposit -> ERR_PAUSED u5016', stranger, PA, 'dep', [principal(SBTC), uintCV(1)], '(err u5016)');
  await refused('unpause at once -> ERR_TIMELOCK_NOT_ELAPSED u5008', DEP, CORE, 'unpause', [], '(err u5008)');
  await refused('unpause by a non-owner while paused -> u5001', stranger, CORE, 'unpause', [], '(err u5001)');
  let h = await advanceBurn(TIMELOCK - 1);
  check('advanced to eligible - 1', String(h), String(P1 + TIMELOCK - 1));
  check('a tx sees that burn height', String(await burnNow()), String(P1 + TIMELOCK - 1));
  await refused('unpause one burn block early -> u5008', DEP, CORE, 'unpause', [], '(err u5008)');
  // a pause while paused restarts the timelock from the current burn height
  const P2 = h;
  await tx('pause again while paused (owner) -> ok, paused-at restarts', DEP, CORE, 'pause', [], '(ok true)');
  await read('re-pause moved paused-at and eligibility', PA, PA, SBTC, { ...base, ...reg, paused: 'true', 'paused-at': `u${P2}`, eligible: `u${P2 + TIMELOCK}`, burn: `u${P2}` });
  h = await advanceBurn(1);
  check('advanced to the first eligibility point', String(h), String(P1 + TIMELOCK));
  await refused('unpause at the first pause\'s eligibility -> u5008 (restarted by the re-pause)', DEP, CORE, 'unpause', [], '(err u5008)');
  h = await advanceBurn(TIMELOCK - 2);
  check('advanced to the new eligible - 1', String(h), String(P2 + TIMELOCK - 1));
  await refused('unpause one burn block before the new eligibility -> u5008', DEP, CORE, 'unpause', [], '(err u5008)');
  h = await advanceBurn(1);
  check('advanced exactly to eligibility', String(h), String(P2 + TIMELOCK));
  check('a tx sees burn height == eligible-at', String(await burnNow()), String(P2 + TIMELOCK));
  await tx('unpause exactly at eligibility -> ok', DEP, CORE, 'unpause', [], '(ok true)');
  await read('unpaused; paused-at is kept', PA, PA, SBTC, { ...base, ...reg, paused: 'false', 'paused-at': `u${P2}`, eligible: `u${P2 + TIMELOCK}`, burn: `u${P2 + TIMELOCK}` });
  await refused('unpause twice -> u5017', DEP, CORE, 'unpause', [], '(err u5017)');
  await tx('unpaused: log-deposit works again', stranger, PA, 'dep', [principal(SBTC), uintCV(1)], '(ok true)');
  reg.equity = 'u1235'; reg.total = 'u1235'; reg.balance = '(ok u1235)';
  const P3 = await burnNow();
  await tx('pause (second cycle)', DEP, CORE, 'pause', [], '(ok true)');
  h = await advanceBurn(TIMELOCK + 5);
  check('advanced past eligibility by 5', String(h), String(P3 + TIMELOCK + 5));
  await tx('unpause after eligibility -> ok', DEP, CORE, 'unpause', [], '(ok true)');
  const B1 = await burnNow();
  await read('second cycle done', PA, PA, SBTC, { ...base, ...reg, paused: 'false', 'paused-at': `u${P3}`, eligible: `u${P3 + TIMELOCK}`, burn: `u${B1}` });

  // ============================================= phase 4: ownership =======
  console.log('PHASE 4: propose-owner / accept-owner');
  const st = { ...base, ...reg, 'paused-at': `u${P3}`, eligible: `u${P3 + TIMELOCK}`, burn: `u${B1}` };
  await refused('accept with no pending owner -> ERR_NO_PENDING_OWNER u5018', NEW, CORE, 'accept-owner', [], '(err u5018)');
  await refused('accept by the owner with no pending owner -> u5018', DEP, CORE, 'accept-owner', [], '(err u5018)');
  await refused('propose by a non-owner -> u5001', stranger, CORE, 'propose-owner', [someCV(principal(stranger))], '(err u5001)');
  await refused('cancel (none) by a non-owner -> u5001', stranger, CORE, 'propose-owner', [noneCV()], '(err u5001)');
  await tx('owner proposes NEW', DEP, CORE, 'propose-owner', [someCV(principal(NEW))], '(ok true)');
  await read('pending NEW', PA, PA, SBTC, { ...st, pending: `(some ${NEW})` });
  await refused('accept by a stranger -> u5001', stranger, CORE, 'accept-owner', [], '(err u5001)');
  await refused('accept by the current owner -> u5001', DEP, CORE, 'accept-owner', [], '(err u5001)');
  await refused('propose by the nominee -> u5001', NEW, CORE, 'propose-owner', [someCV(principal(NEW2))], '(err u5001)');
  await tx('owner cancels (none)', DEP, CORE, 'propose-owner', [noneCV()], '(ok true)');
  await read('pending cleared', PA, PA, SBTC, st);
  await refused('accept by NEW after the cancel -> u5018', NEW, CORE, 'accept-owner', [], '(err u5018)');
  await tx('owner proposes NEW2', DEP, CORE, 'propose-owner', [someCV(principal(NEW2))], '(ok true)');
  await tx('owner replaces the proposal with NEW', DEP, CORE, 'propose-owner', [someCV(principal(NEW))], '(ok true)');
  await refused('accept by the replaced nominee NEW2 -> u5001', NEW2, CORE, 'accept-owner', [], '(err u5001)');
  // the source has no cooldown: the nominee may accept in the same block
  check('no burn block passed since the proposal', String(await burnNow()), String(B1));
  await tx('NEW accepts at once (no cooldown in the source)', NEW, CORE, 'accept-owner', [], '(ok true)');
  await read('owner NEW, pending none', PA, PA, SBTC, { ...st, owner: NEW });
  await refused('accept again by NEW -> u5018', NEW, CORE, 'accept-owner', [], '(err u5018)');

  console.log('PHASE 5: the old owner has no powers; the new owner has all of them');
  await refused('old owner pause -> u5001', DEP, CORE, 'pause', [], '(err u5001)');
  await refused('old owner propose -> u5001', DEP, CORE, 'propose-owner', [someCV(principal(DEP))], '(err u5001)');
  await refused('old owner set-verified -> u5001', DEP, CORE, 'set-verified-contract', [principal(PB)], '(err u5001)');
  await refused('old owner unpause while not paused -> u5001', DEP, CORE, 'unpause', [], '(err u5001)');
  await refused('new owner unpause while not paused -> u5017', NEW, CORE, 'unpause', [], '(err u5017)');
  await tx('new owner verifies probe b', NEW, CORE, 'set-verified-contract', [principal(PB)], '(ok true)');
  await read('probe b verified by NEW', PB, PA, SBTC, { ...st, owner: NEW, verified: 'true', hash: `(some ${H.PB})`, registered: 'false' });
  const P4 = await burnNow();
  await tx('new owner pauses', NEW, CORE, 'pause', [], '(ok true)');
  await refused('old owner unpause while paused -> u5001', DEP, CORE, 'unpause', [], '(err u5001)');
  await refused('new owner unpause at once -> u5008', NEW, CORE, 'unpause', [], '(err u5008)');
  h = await advanceBurn(TIMELOCK);
  check('advanced to eligibility', String(h), String(P4 + TIMELOCK));
  await refused('old owner unpause after the timelock -> u5001', DEP, CORE, 'unpause', [], '(err u5001)');
  await tx('new owner unpauses at eligibility', NEW, CORE, 'unpause', [], '(ok true)');
  await tx('new owner proposes the old owner back', NEW, CORE, 'propose-owner', [someCV(principal(DEP))], '(ok true)');
  await read('final state', PA, PA, SBTC, { ...st, owner: NEW, pending: `(some ${DEP})`, 'paused-at': `u${P4}`, eligible: `u${P4 + TIMELOCK}`, burn: `u${P4 + TIMELOCK}` });

  console.log(`${passed}/${checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${sid}`);
}
function initArgs(canonical) {
  return [principal(canonical), principal(SBTC), principal(STX), uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)];
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
