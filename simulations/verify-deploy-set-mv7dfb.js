// verify-deploy-set-mv7dfb.js - ONE stxer mainnet-fork session for the whole
// bounty mv7dfb deploy set, in DEPLOY-PLAN.md order, from the EXACT deploy
// bytes, then every vault through the NEW router (15aef66).
//
// Deploy bytes
//   faktory-dao backend/server/utils/<name>-template.ts (FAKTORY_DIR, default
//   ~/projects/faktory-dao, checked at 77d9ba48): the template literal is the
//   deploy body; its SHA-256 must equal the "SHA-256:" in the template header.
//   Jing 1-8 (core-v6, ladder-v1, market v6-3, router v5-3, rung trait,
//   20 rungs from the two -v1 templates, dispatch), J1-J3 (trait-v2, pool,
//   autoswap), P1-P2 (safe helpers, safe).
//   No template exists for the partner contracts. They deploy from the repo
//   file at the final commit, byte for byte (no stripping, no formatting):
//   fastpool-swap-vault (b719e87) + signer-manager-vault-stx-rewards
//   (3f82a93) under SPMPMA1V... (the Fast Pool deployer: the vault's POOL is
//   relative, the Jing bindings are SPV9K21 literals), ccd015 + ccd016
//   (8bfbb5f) under SP8A9HZ3... (the DAO; ccd016's STX_FAIR_BOOK is relative).
//
// Fixtures (Eval, labelled "fixture:" in the output):
//   - PoX earned rewards for past cycles (pox-5 maps), backed by real sBTC
//     sent into pox-5. pox-5 pays rewards only after real cycles; the share
//     maps are what pay-stx-stakers reads.
//   - the live Lazer oracle fee var-set to u10 (no governance VAA can be
//     signed on a fork), and back to u0 later.
//   - base-dao Extensions map-set for ccd016 + a proxy that plays a passed
//     CCIP proposal (what set-extensions does after a vote).
// Everything else is real: signer registration (pox-5 grant hash), stakes,
// stake-update hop, unstake, cycle crossing, evict-og, Jing placement and
// reclaim, real STX maker bids, router fills, recovery after 432 blocks,
// passkey (WebAuthn P-256) owner transfer, Bitflow's own migrate-pool path.
//
// The fork is pinned DEPLOY_SET_LAG_SECS (default 5400) before now, so the
// synthetic blocks (about 2,100 burn blocks at 1 s) never run the fork clock
// past the signed Lazer prints. The DLMM core migration (3 x 500,000 s) runs
// last for that reason.
//
// Run: PYTH_API_KEY=... node simulations/verify-deploy-set-mv7dfb.js
//      (no key: the public backend route serves the same signed print)
//   DEPLOY_SET_FORK_BLOCK=<height> pins the fork; ONLY=juice,safe,fast,ccd,router
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  Cl, ClarityVersion, deserializeCV, cvToString, serializeCV, getAddressFromPrivateKey, randomPrivateKey,
  privateKeyToPublic, signMessageHashRsv, makeUnsignedContractDeploy, makeUnsignedSTXTokenTransfer,
  PostConditionMode, tupleCV as rawTupleCV, uintCV, stringAsciiCV, principalCV, bufferCV, listCV,
} from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const HOME = homedir();
const FAKTORY = process.env.FAKTORY_DIR || resolve(HOME, 'projects/faktory-dao');
const TPL_DIR = resolve(FAKTORY, 'backend/server/utils');
const FASTPOOL = resolve(HOME, 'projects/fastpool-pox-5/contracts');
const CITY = resolve(HOME, 'projects/citycoins-protocol/contracts/extensions');
const PILLAR = resolve(HOME, 'projects/pillar/contracts/pillar-wallets');
const NODE = process.env.STACKS_API_URL || 'http://77.42.3.101/stacks-api';
const ONLY = new Set((process.env.ONLY || 'juice,safe,fast,ccd,router').split(','));

// ---- principals --------------------------------------------------------------
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const FP = 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4';      // Fast Pool deployer
const DAO = 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH';     // CityCoins DAO
const FAKFUN_DEPLOYER = 'SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const STX_WHALE = 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR';  // ~970k STX
const HOP = 'SP13CM9QN6J23B6T6415SC0T8JQZ3YADPD1TJ27WZ';     // 200k STX at fastpool-max500 on mainnet
const HOP_SIGNER = `${FP}.fastpool-max500-signer-manager`;
const OWNER = SBTC_WHALE, RECOVERY = 'SP3HXJJMJQ06GNAZ8XWDN1QM48JEDC6PP6W3YZPZJ';
const RELAYER = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM', RECIPIENT = 'SP22WH53NS94VR6N145ZX77BK4S0EWFBE41VW3Z6B';
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const OG1 = mk(611), ALICE = mk(612), EMPTY = mk(613), STRANGER = mk(614), RANDOM = mk(615), FS1 = mk(621), FS2 = mk(622);
const DIA_UPDATER = 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0';

// ---- contracts -----------------------------------------------------------------
const POX = 'SP000000000000000000002Q6VF78.pox-5';
const ORACLE = 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const CORE = `${DEP}.jing-core-v6`, LADDER = `${DEP}.jing-ladder-v1`, MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`;
const ROUTER = `${DEP}.swap-router-sbtc-stx-jing-v5-3`, DISPATCH = `${DEP}.jing-ladder-dispatch`;
const PID = `${DEP}.juice-pool-sbtc-signer`, VID = `${DEP}.juice-sbtc-autoswap`;
const SAFE = `${DEP}.juice-autostake-safe`, WCORE = `${DEP}.fakfun-wallet-core-v2`;
const FVAULT = `${FP}.fastpool-swap-vault`, FPOOL = `${FP}.signer-manager-vault-stx-rewards`;
const BOOK = `${DAO}.ccd015-redemption-book-mia-stx`, CCD = `${DAO}.ccd016-swap-vault-mia-v2`, PROXY = `${DAO}.sim-ccip-proxy`;
const TREASURY = `${DAO}.ccd002-treasury-mia-rewards-v3`, BASE_DAO = `${DAO}.base-dao`;
const DLMM_POOLS = [1, 2, 3].map((i) => `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-${i}-bps-15`);
const DLMM_POOL_IDS = [6n, 15n, 16n];
const DLMM_CORE_ID = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const DLMM_ADMIN = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD';
const FIRST_BURN = 666050, CYCLE = 2100;
const STX = 1_000_000n, PP = 100_000_000n, BPS = 10_000n;
const SPREADS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

// ---- deploy bytes --------------------------------------------------------------
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const sha512_256 = (s) => createHash('sha512-256').update(s).digest('hex');
function template(name) {
  const t = fs.readFileSync(resolve(TPL_DIR, `${name}-template.ts`), 'utf8');
  const body = t.slice(t.indexOf('= `') + 3, t.lastIndexOf('`')).replace(/\\([`$\\])/g, '$1');
  const want = (t.match(/SHA-256: ([0-9a-f]{64})/) || [])[1];
  if (!want || sha256(body) !== want) throw new Error(`${name}: template body sha256 ${sha256(body)} != header ${want}`);
  return { body, form: `faktory-dao template ${name}-template.ts (sha256 ${want.slice(0, 12)}...)` };
}
const repoFile = (path, label) => ({ body: fs.readFileSync(path, 'utf8'), form: `repo file ${label}, byte for byte` });
const SOURCES = {};

// ---- harness state ---------------------------------------------------------------
let sid, ops = 0;
const checks = [], notes = [];
const decode = (step) => {
  const r = step?.Result ?? step;
  if (r?.Eval?.Ok !== undefined) return cvToString(deserializeCV(r.Eval.Ok));
  if (r?.Transaction?.Ok) {
    const t = r.Transaction.Ok;
    if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t).slice(0, 400)}`;
    return cvToString(deserializeCV(t.result));
  }
  return `ENGINE-ERR ${JSON.stringify(r).slice(0, 400)}`;
};
const url = () => `https://stxer.xyz/simulations/mainnet/${sid}`;
function save(extra = {}) {
  const dir = new URL('./results/', import.meta.url);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(new URL('deploy-set-mv7dfb.json', dir), JSON.stringify({ simulation: url(), passed: checks.filter((c) => c.passed).length, total: checks.length,
    sources: SOURCES, notes, fixtures: FIXTURES, ...extra, checks }, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2) + '\n');
}
function check(label, actual, want) {
  const passed = typeof want === 'function' ? !!want(actual) : String(actual) === String(want);
  checks.push({ label, actual: String(actual).slice(0, 600), passed });
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${checks.length}. ${label}: ${String(actual).slice(0, 300)}`);
  if (!passed && process.env.SOFT) return actual;
  if (!passed) { save({ stoppedAt: label }); throw new Error(`STOP at "${label}" (want ${typeof want === 'function' ? want.toString().slice(0, 160) : want}). ${url()}`); }
  return actual;
}
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i < 8 && /block info|ECONNRESET|fetch failed|socket|50[0-9]|busy|409|timeout|terminated/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 5000)); continue; }
      throw e;
    }
  }
}
async function step(s) { return (await retry(() => submitSimulationSteps(sid, { steps: [s] }))).steps[0]; }
async function tenure() { if (++ops % 20 === 0) await step({ TenureExtend: { cause: 'Extended' } }); }
async function evRaw(cid, code, sender = DEP) { await tenure(); return decode({ Result: await step({ Eval: [sender, '', cid, code] }) }); }
async function ev(label, cid, code, want) { return check(label, await evRaw(cid, code), want); }
async function tx(label, sender, cid, fn, args, want) {
  await tenure();
  const r = await retry(() => callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0, postConditionMode: PostConditionMode.Allow }));
  const result = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify({ vm: r.vmError, pc: r.pcAborted }).slice(0, 400)}` : r.result;
  check(label, result, want);
  return { result, receipt: r.receipt, f: fields(result) };
}
async function deploy(name, src, version, sender = DEP) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: src.body, clarityVersion: version, nonce: await getNonce(sid, sender), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, sender);
  const out = await step({ Transaction: raw.serialize() });
  SOURCES[`${sender}.${name}`] = { form: src.form, bytes: Buffer.byteLength(src.body), sha256: sha256(src.body), sha512_256: sha512_256(src.body), clarity: version };
  check(`deploy ${sender.slice(0, 6)}.${name} (${Buffer.byteLength(src.body)} B, ${src.form})`, decode({ Result: out }), (v) => v.startsWith('(ok'));
}
async function sendStx(label, from, to, amount) {
  const raw = await makeUnsignedSTXTokenTransfer({ recipient: to, amount: BigInt(amount), nonce: await getNonce(sid, from), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, from);
  check(label, decode({ Result: await step({ Transaction: raw.serialize() }) }), '(ok true)');
}
let burn;
const offset = () => (burn - FIRST_BURN) % CYCLE;
const cycleOf = () => Math.floor((burn - FIRST_BURN) / CYCLE);
async function advance(n, label) {
  for (let left = n; left > 0;) {
    const k = Math.min(left, 300);
    const s = await step({ AdvanceBlocks: { bitcoin_blocks: k, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 } });
    if (!JSON.stringify(s).includes('Ok')) check(`advance ${k}`, JSON.stringify(s).slice(0, 300), 'ok');
    left -= k; burn += k;
  }
  check(`${label}: advanced ${n} burn blocks (burn ${burn}, cycle ${cycleOf()}, offset ${offset()})`, String(await evRaw(DEP + '.jing-core-v6', 'burn-block-height')), `u${burn}`);
}

// ---- value helpers -----------------------------------------------------------------
function fields(s) {
  const o = {};
  for (const m of String(s).matchAll(/\(([a-z0-9-]+) (u\d+|true|false)\)/g)) o[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : BigInt(m[2].slice(1));
  return o;
}
const U = (s) => { const m = /u(\d+)/.exec(String(s)); if (!m) throw new Error(`no uint in ${s}`); return BigInt(m[1]); };
const ok = (v) => String(v).startsWith('(ok');
const cp = (id) => Cl.contractPrincipal(...id.split('.'));
const P = (s) => Cl.principal(s);
const sbtcOf = (who) => `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`;
const stxOf = (who) => `(stx-get-balance '${who})`;
const read = async (code, cid = MARKET) => U(await evRaw(cid, code));
const events = (r) => (r.receipt?.events ?? []).map((e) => (typeof e === 'string' ? JSON.parse(e) : e)).filter((e) => e.committed !== false);
const printsOf = (r, contract) => events(r).filter((e) => e.contract_event && e.contract_event.contract_identifier === contract).map((e) => cvToString(deserializeCV(e.contract_event.raw_value)));
const stxTransfers = (r) => events(r).map((e) => e.stx_transfer_event).filter(Boolean).map((t) => ({ ...t, amount: BigInt(t.amount) }));
const js = (o) => JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? String(v) : v));
const tupleCV = (f) => rawTupleCV(Object.fromEntries(Object.entries(f).sort(([a], [b]) => a.localeCompare(b))));
let lz, UPD, MID;
async function fresh() {
  const stamp = Number(U(await evRaw(MARKET, 'stacks-block-time')));
  for (let i = 0; i < 40; i++) {
    const p = await fetchLazerUpdateAny();
    if ((await lazerFeedTimes(p.hex)).at > stamp) { lz = p; UPD = Cl.buffer(Buffer.from(p.hex.replace(/^0x/, ''), 'hex')); MID = (p.px * PP) / p.py; return UPD; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('no signed print newer than the fork clock');
}
const FIXTURES = [];
async function fixture(label, cid, code, want) { FIXTURES.push(label); return ev(`fixture: ${label}`, cid, code, want); }
// Earned rewards of a past cycle for `signer`, backed by real sBTC sent to pox-5.
async function rewards(signer, rc, sats, shares) {
  await tx(`real sBTC into pox-5 backs cycle ${rc} rewards (${sats} sats)`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(sats), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
  const key = `{ reward-cycle: u${rc}, bond-index: none, signer: '${signer} }`;
  const total = shares.reduce((t, [, n]) => t + n, 0n);
  const sets = shares.map(([w, n]) => `(map-set staker-shares-staked-for-cycle { reward-cycle: u${rc}, bond-index: none, signer: '${signer}, staker: '${w} } u${n})`).join(' ');
  await fixture(`cycle ${rc} earned ${sats} sats for ${signer.split('.')[1]}, shares ${shares.map(([w, n]) => `${w.slice(0, 6)}=${n}`).join(' ')}`, POX, `(begin
    (map-set signer-shares-staked-for-cycle ${key} u${total})
    (map-set signer-pending-staked-ustx-per-cycle { signer: '${signer}, cycle: u${rc} } u${total})
    (map-set signer-rewards-per-token-settled-for-cycle ${key} (get-rewards-per-token-for-cycle u${rc} none))
    (map-set signer-unclaimed-rewards-for-cycle ${key} u${sats})
    ${sets}
    (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${sats}))
    (ok true))`, '(ok true)');
  return total;
}
// A real STX bid resting on the v6-3 book, so the router's Jing leg fills.
async function stxBid(sats, tag) {
  await fresh();
  const amount = (sats * MID) / 10_000_000_000n * 2n;
  await tx(`${tag}: real STX maker bid (${amount} uSTX at mid + 5%)`, STX_WHALE, MARKET, 'deposit-token-y', [Cl.uint(amount), Cl.uint((MID * 105n) / 100n), Cl.none(), cp(WSTX), Cl.stringAscii('wstx')], `(ok u${amount})`);
  if ((await evRaw(MARKET, `(get-token-y-pending-deposit '${STX_WHALE})`)) !== 'none')
    await tx(`${tag}: settle the pending STX bid`, STX_WHALE, MARKET, 'settle-token-y-deposit', [P(STX_WHALE), await fresh(), cp(WSTX), Cl.stringAscii('wstx')], ok);
  await ev(`${tag}: STX bid is live on the book`, MARKET, `(get-token-y-deposit (get-current-cycle) '${STX_WHALE})`, (v) => U(v) > 0n);
}
async function cancelBid(tag) {
  if (U(await evRaw(MARKET, `(get-token-y-deposit (get-current-cycle) '${STX_WHALE})`)) > 0n)
    await tx(`${tag}: bidder cancels the rest of its bid (book clean for the next batch)`, STX_WHALE, MARKET, 'cancel-token-y-deposit', [cp(WSTX), Cl.stringAscii('wstx')], ok);
}
function routing(r) {
  const s = printsOf(r, ROUTER).find((p) => p.includes('smart-swap-sbtc-for-stx') || p.includes('swap-sbtc-for-stx'));
  return s ? fields(s) : null;
}
const feeEvents = (r, payer, feeTo) => stxTransfers(r).filter((t) => t.sender === payer && t.recipient === feeTo).map((t) => t.amount);

// =========================================================================================
async function main() {
  // ---- fork block -----------------------------------------------------------------------
  let fork = process.env.DEPLOY_SET_FORK_BLOCK ? Number(process.env.DEPLOY_SET_FORK_BLOCK) : null;
  if (!fork) {
    const get = async (p) => (await fetch(`${NODE}${p}`)).json();
    const tip = (await get('/extended/v1/block?limit=1')).results[0];
    const target = Math.floor(Date.now() / 1000) - Number(process.env.DEPLOY_SET_LAG_SECS ?? 5400);
    let lo = tip.height - 20000, hi = tip.height;
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); ((await get(`/extended/v2/blocks/${m}`)).block_time <= target) ? lo = m : hi = m; }
    fork = lo;
  }
  const forkInfo = await (await fetch(`${NODE}/extended/v2/blocks/${fork}`)).json();
  burn = forkInfo.burn_block_height;
  console.log(`fork block ${fork}, burn ${burn} (cycle ${cycleOf()}, offset ${offset()}), block time ${forkInfo.block_time}`);
  if (offset() > 1700) throw new Error('fork lands too close to the prepare phase; pin DEPLOY_SET_FORK_BLOCK');

  // ---- sources ---------------------------------------------------------------------------
  const T = Object.fromEntries(['jing-core-v6', 'jing-ladder-v1', 'markets-sbtc-stx-jing-v6-3', 'swap-router-sbtc-stx-jing-v5-3', 'jing-rung-deposit-trait',
    'jing-buy-stx-core-spread-v1', 'jing-sell-stx-core-spread-v1', 'jing-ladder-dispatch', 'juice-swap-vault-trait-v2', 'juice-pool-sbtc-signer',
    'juice-sbtc-autoswap', 'juice-autostake-safe-auth-helpers-v1', 'juice-autostake-safe'].map((n) => [n, template(n)]));
  const FPV = repoFile(`${FASTPOOL}/fastpool-swap-vault.clar`, 'fastpool-pox-5 b719e87 contracts/fastpool-swap-vault.clar');
  const FPS = repoFile(`${FASTPOOL}/signer-manager-vault-stx-rewards.clar`, 'fastpool-pox-5 3f82a93 contracts/signer-manager-vault-stx-rewards.clar');
  const strip = (f) => ({ body: f.body.split('\n').filter((l) => !/^\s*;;/.test(l)).join('\n'), form: f.form.replace('byte for byte', 'full-line comments dropped (the ccd016 harness deploy form)') });
  const C15 = strip(repoFile(`${CITY}/ccd015-redemption-book-mia-stx.clar`, 'citycoins-protocol 8bfbb5f ccd015-redemption-book-mia-stx.clar'));
  const C16 = strip(repoFile(`${CITY}/ccd016-swap-vault-mia-v2.clar`, 'citycoins-protocol 8bfbb5f ccd016-swap-vault-mia-v2.clar'));
  for (const [s, needle] of [[T['juice-sbtc-autoswap'], `${DEP}.swap-router-sbtc-stx-jing-v5-3`], [FPV, `${DEP}.swap-router-sbtc-stx-jing-v5-3`], [C16, `${DEP}.swap-router-sbtc-stx-jing-v5-3`], [T['juice-autostake-safe'], PID]])
    if (!s.body.includes(needle)) throw new Error(`${s.form} does not name ${needle}`);

  const b = SimulationBuilder.new({ stacksNodeAPI: NODE }).useBlockHeight(fork);
  b.withSender(DEP).addContractDeploy({ contract_name: 'jing-core-v6', source_code: T['jing-core-v6'].body, clarity_version: ClarityVersion.Clarity5 });
  sid = await retry(() => b.run());
  console.log(`View: ${url()}`);
  SOURCES[`${DEP}.jing-core-v6`] = { form: T['jing-core-v6'].form, bytes: Buffer.byteLength(T['jing-core-v6'].body), sha256: sha256(T['jing-core-v6'].body), sha512_256: sha512_256(T['jing-core-v6'].body), clarity: 5 };
  check('Jing 1: deploy jing-core-v6 (template)', decode((await retry(() => getSimulationResult(sid))).steps.find((s) => s.Result?.Transaction)), ok);

  // ==== Jing 2-8 + post-deploy calls (DEPLOY-PLAN section 1) =================================
  await deploy('jing-ladder-v1', T['jing-ladder-v1'], ClarityVersion.Clarity5);
  await deploy('markets-sbtc-stx-jing-v6-3', T['markets-sbtc-stx-jing-v6-3'], ClarityVersion.Clarity5);
  await tx('Jing post 3a: market sync-seat-count reads ladder max u10', DEP, MARKET, 'sync-seat-count', [], '(ok u10)');
  await tx('Jing post 3b: core-v6 set-verified-contract(market)', DEP, CORE, 'set-verified-contract', [cp(MARKET)], '(ok true)');
  await tx('Jing post 3c: market initialize (registers with core-v6)', DEP, MARKET, 'initialize', [cp(MARKET), cp(SBTC), cp(WSTX), Cl.uint(1000), Cl.uint(1_000_000), Cl.uint(1), Cl.uint(45)], '(ok true)');
  await deploy('swap-router-sbtc-stx-jing-v5-3', T['swap-router-sbtc-stx-jing-v5-3'], ClarityVersion.Clarity5);
  await ev('router binds the deployed market literal', ROUTER, '(list JING_MARKET)', `(list ${MARKET})`);
  await deploy('jing-rung-deposit-trait', T['jing-rung-deposit-trait'], ClarityVersion.Clarity5);
  for (const [dir, side, tpl] of [['buy', 'buy-band', 'jing-buy-stx-core-spread-v1'], ['sell', 'sel-band', 'jing-sell-stx-core-spread-v1']]) {
    for (const bps of SPREADS) {
      const name = `jing-${dir}-stx-spread-${bps}`, rung = `${DEP}.${name}`;
      await deploy(name, T[tpl], ClarityVersion.Clarity5);
      if (bps === 0) {
        await tx(`${name}: initialize before set-canonical -> refused`, DEP, rung, 'initialize', [Cl.uint(bps), Cl.bool(true)], (v) => v.startsWith('(err'));
        await tx(`ladder set-canonical("${side}", ${name})`, DEP, LADDER, 'set-canonical', [Cl.stringAscii(side), cp(rung)], '(ok true)');
      }
      await tx(`${name}: initialize(u${bps}, true) registers + seats`, DEP, rung, 'initialize', [Cl.uint(bps), Cl.bool(true)], '(ok true)');
    }
    await ev(`all 10 ${dir} rungs seated`, LADDER, `(list ${SPREADS.map((bps) => `(is-band-${dir === 'buy' ? 'x' : 'y'} '${DEP}.jing-${dir}-stx-spread-${bps})`).join(' ')})`, `(list ${SPREADS.map(() => 'true').join(' ')})`);
  }
  await deploy('jing-ladder-dispatch', T['jing-ladder-dispatch'], ClarityVersion.Clarity5);

  // ==== J1-J3 + register-self (section 2) ====================================================
  await deploy('juice-swap-vault-trait-v2', T['juice-swap-vault-trait-v2'], ClarityVersion.Clarity6);
  await deploy('juice-pool-sbtc-signer', T['juice-pool-sbtc-signer'], ClarityVersion.Clarity6);
  await deploy('juice-sbtc-autoswap', T['juice-sbtc-autoswap'], ClarityVersion.Clarity6);
  const grant = async (signer, authId) => {
    const priv = randomPrivateKey(), key = privateKeyToPublic(priv);
    const [a, n] = POX.split('.');
    const r = await (await fetch(`${NODE}/v2/contracts/call-read/${a}/${n}/get-signer-grant-message-hash`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sender: DEP, arguments: [cp(signer), Cl.uint(authId)].map((c) => '0x' + serializeCV(c).replace(/^0x/, '')) }) })).json();
    const sig = signMessageHashRsv({ messageHash: r.result.replace(/^0x/, '').slice(2 + 8), privateKey: priv });
    return [cp(signer), Cl.buffer(Buffer.from(key.replace(/^0x/, ''), 'hex')), Cl.uint(authId), Cl.buffer(Buffer.from(sig.replace(/^0x/, ''), 'hex'))];
  };
  await tx('J post: register-self by a stranger -> u100', STRANGER, PID, 'register-self', await grant(PID, 7), '(err u100)');
  await tx('J post: register-self (grant-signer-key + register-signer, real pox-5 grant hash)', DEP, PID, 'register-self', await grant(PID, 7), ok);
  await ev('pox-5 knows the pool as a signer', POX, `(get-signer-info '${PID})`, (v) => v.startsWith('(some'));
  await ev('pool: fee 450, OG cap 2.1M STX, no seats, budget 0', PID, `{ fee: (get-fee-bips), og: (get-og-status), vault: (get-swap-vault) }`,
    (v) => v.includes('(fee u450)') && v.includes('(cap-ustx u2100000000000)') && v.includes('(seats u0)') && v.includes(VID));
  await ev('autoswap config: pyth-fee-budget u0', VID, '(get-config)', (v) => v.includes('(pyth-fee-budget u0)'));

  // ==== P1-P2 + core-v2 verify (section 3) ==================================================
  await deploy('juice-autostake-safe-auth-helpers-v1', T['juice-autostake-safe-auth-helpers-v1'], ClarityVersion.Clarity4);
  await deploy('juice-autostake-safe', T['juice-autostake-safe'], ClarityVersion.Clarity6);
  await tx('P post: core-v2 set-verified-contract(safe) computes the on-chain hash', DEP, WCORE, 'set-verified-contract', [P(SAFE), Cl.none()], ok);
  const canon = sha512_256(T['juice-autostake-safe'].body);
  await ev(`core-v2 canonical hash == sha512/256 of the template bytes (${canon.slice(0, 8)}...${canon.slice(-8)})`, WCORE, `(get-verified-contract-hash '${SAFE})`, `(some 0x${canon})`);
  check('template canonical hash is the one DEPLOY-PLAN pins (cdb7c603...732a7a97, 7724b0d)', canon, (v) => v.startsWith('cdb7c603') && v.endsWith('732a7a97'));

  // ==== Partners (section 4): fastpool then MIA =============================================
  if (ONLY.has('fast')) {
    await deploy('fastpool-swap-vault', FPV, ClarityVersion.Clarity6, FP);
    await deploy('signer-manager-vault-stx-rewards', FPS, ClarityVersion.Clarity6, FP);
  }
  if (ONLY.has('ccd')) {
    await deploy('ccd015-redemption-book-mia-stx', C15, ClarityVersion.Clarity5, DAO);
    await deploy('ccd016-swap-vault-mia-v2', C16, ClarityVersion.Clarity5, DAO);
  }
  const C = cycleOf();
  if (ONLY.has('juice')) await juice(C);
  if (ONLY.has('fast')) await fastpool();
  if (ONLY.has('ccd')) await ccd016();
  if (ONLY.has('juice')) await juiceCrossing(C);
  if (ONLY.has('router')) await router();
  save({ fork, forkBurn: forkInfo.burn_block_height });
  console.log(`\n=== deploy set mv7dfb: ${checks.filter((c) => c.passed).length}/${checks.length} checks green ===\n${url()}`);
  for (const c of checks.filter((x) => !x.passed)) console.log(`FAILED: ${c.label}: ${c.actual.slice(0, 300)}`);
}

// =========================================================================================
// Juice: OG seats, safe onboard + stake, three reward batches (fee 0, fee > 0, recovery).
const R1 = 144, R2 = 143, R3 = 142, FEE = 10n, BUDGET = 20n, FLOAT = 1000n;
let safeShare;
async function juice(C) {
  const juice = (fn, args) => [...args, cp(VID)];
  const stake = (label, who, ustx, want = ok, cycles = 96) => tx(label, who, POX, 'stake', [cp(PID), Cl.uint(ustx), Cl.uint(cycles), Cl.uint(burn), Cl.none()], want);
  const og = (label, seats, covered) => ev(label, PID, '(get-og-status)', (v) => v.includes(`(seats u${seats})`) && v.includes(`(covered-ustx u${covered})`));
  // -- OG seats ---------------------------------------------------------------------------
  await sendStx('fund OG1 1,001 STX', STX_WHALE, OG1, 1001n * STX);
  await stake('OG1 stakes 1,000 STX for 96 cycles (real pox-5 -> validate-stake!)', OG1, 1000n * STX);
  await ev('OG1 holds a 1,000 STX seat', PID, `(get-og-ustx '${OG1})`, `u${1000n * STX}`);
  await ev('HOP is locked at fastpool-max500 on mainnet (200k STX)', POX, `(get-staker-info '${HOP})`, (v) => v.includes(HOP_SIGNER) && v.includes('(amount-ustx u200000000000)'));
  await tx('HOP: stake-update fastpool-max500 -> juice pool (a hop, no new STX)', HOP, POX, 'stake-update', [cp(PID), cp(HOP_SIGNER), Cl.uint(0), Cl.uint(0), Cl.none()], ok);
  await ev('HOP takes a 200k STX seat', PID, `(get-og-ustx '${HOP})`, 'u200000000000');
  await og('2 seats, 201,000 STX covered', 2, 201_000n * STX);
  await ev('ALICE has no seat (pays the 4.5% fee)', PID, `(is-og '${ALICE})`, 'false');

  // -- autostake safe onboard + stake (P2) --------------------------------------------------
  if (ONLY.has('safe')) {
    await sendStx('fund the canonical safe 2,000 STX', STX_WHALE, SAFE, 2000n * STX);
    await tx('onboard the canonical safe (FAKFUN relay)', FAKFUN_DEPLOYER, SAFE, 'onboard',
      [Cl.buffer(Buffer.from('02' + 'ab'.repeat(32), 'hex')), P(OWNER), P(RECOVERY), Cl.uint(100_000_000), Cl.uint(100_000), Cl.uint(144)], ok);
    await ev('safe keeper defaults to chavita', SAFE, '(get-keeper)', DEP);
    const sk = await tx('owner: stake-stx-juice 2,000 STX into the pool, signer-calldata "telegram" (real pox-5 stake)', OWNER, SAFE, 'stake-stx-juice', [Cl.uint(2000n * STX), Cl.none(), Cl.none(), Cl.some(Cl.bufferFromAscii('telegram'))], ok);
    check('pool validate-stake print carries the safe ref (signer-calldata 99d69e8)', printsOf(sk, PID).find((p) => p.includes('"validate-stake"')) ?? 'no validate-stake print',
      (v) => v.includes(`(staker ${SAFE})`) && v.includes(`(signer-calldata (some 0x${Buffer.from('telegram').toString('hex')}))`));
    await ev('pox-5 position names the pool', POX, `(get-staker-info '${SAFE})`, (v) => v.includes(PID) && v.includes(`(amount-ustx u${2000n * STX})`));
    await ev('safe takes a 2,000 STX seat', PID, `(get-og-ustx '${SAFE})`, `u${2000n * STX}`);
    await tx('nothing landed yet: keeper restake refused (u4026)', DEP, SAFE, 'restake', [], '(err u4026)');
    await og('3 seats, 203,000 STX covered', 3, 203_000n * STX);
    await safeCopies();
  }
  // -- vault knobs while idle -----------------------------------------------------------------
  await tx('stranger cannot set the vault window through the pool (u100)', STRANGER, PID, 'set-vault-window-blocks', juice(0, [Cl.uint(3)]), '(err u100)');
  await tx('admin: set-vault-window-blocks u3 (vault idle)', DEP, PID, 'set-vault-window-blocks', juice(0, [Cl.uint(3)]), '(ok true)');
  await tx('admin: set-vault-max-chunk-sats u50000', DEP, PID, 'set-vault-max-chunk-sats', juice(0, [Cl.uint(50000)]), '(ok true)');
  await tx('window 289 refused (u16033)', DEP, PID, 'set-vault-window-blocks', juice(0, [Cl.uint(289)]), '(err u16033)');
  await tx('pyth budget above 10 STX refused (u16033)', DEP, PID, 'set-vault-pyth-fee-budget', juice(0, [Cl.uint(10_000_001)]), '(err u16033)');

  // ================= batch 1: fee 0 ===================================================
  const F1 = 150_000n;
  const sh1 = [[OG1, 1000n * STX], [ALICE, 3000n * STX], ...(ONLY.has('safe') ? [[SAFE, 2000n * STX]] : [])];
  await rewards(PID, R1, F1, sh1);
  const c1 = await tx('B1 stranger: pox-claim-rewards -> vault funded (fund opens the clock)', STRANGER, PID, 'pox-claim-rewards', [Cl.list([]), Cl.uint(R1), cp(VID)], (v) => ok(v) && v.includes(`(total-rewards u${F1})`));
  await ev('B1 vault holds the reward, pool holds no sBTC', VID, `{ v: ${sbtcOf(VID)}, p: ${sbtcOf(PID)} }`, `(tuple (p u0) (v u${F1}))`);
  await ev('B1 pending-swap = cycle 144 tranche 0', PID, '(get-pending-swap)', `(some (tuple (reward-cycle u${R1}) (tranche u0)))`);
  await tx('B1 claim again in the same distribution cycle -> u112', STRANGER, PID, 'pox-claim-rewards', [Cl.list([]), Cl.uint(R1), cp(VID)], '(err u112)');
  await tx('B1 jing-place (stranger, real signed print): rests at the floor', STRANGER, VID, 'jing-place', [await fresh()], (v) => ok(v) && v.includes(`(amount u${F1})`));
  await ev('B1 resting on the v6-3 book, vault holds 0 sBTC', MARKET, `{ book: (get-token-x-deposit (get-current-cycle) '${VID}), vault: ${sbtcOf(VID)} }`, `(tuple (book u${F1}) (vault u0))`);
  await tx('B1 router-swap during patience -> u16031', STRANGER, VID, 'router-swap', [await fresh()], '(err u16031)');
  await tx('B1 jing-take during patience -> u16031', DEP, PID, 'jing-take', juice(0, [Cl.uint(50000), UPD]), '(err u16031)');
  await tx('B1 finalize while resting -> u16032', STRANGER, PID, 'finalize-swap', [cp(VID)], '(err u16032)');
  await advance(3, 'B1 patience window (3 blocks)');
  await tx('B1 jing-reclaim by anyone after the window', STRANGER, VID, 'jing-reclaim', [], (v) => ok(v) && v.includes(`(amount u${F1})`));
  await stxBid(F1, 'B1');
  // jing-take (manual book take, pool admin)
  let vs = await read(stxOf(VID));
  await tx('B1 stranger cannot jing-take (u100)', STRANGER, PID, 'jing-take', juice(0, [Cl.uint(50000), await fresh()]), '(err u100)');
  const jt = await tx('B1 admin jing-take 50k sats on the book through the pool', DEP, PID, 'jing-take', juice(0, [Cl.uint(50000), await fresh()]), (v) => ok(v) && v.includes('(amount u50000)') && U((v.match(/\(out u\d+\)/) || ['u0'])[0]) > 0n);
  await ev('B1 jing-take: vault sBTC 100k, STX + out', VID, `{ s: ${sbtcOf(VID)}, x: ${stxOf(VID)} }`, `(tuple (s u100000) (x u${vs + jt.f.out}))`);
  vs += jt.f.out;
  // router-swap (smart path, permissionless)
  const rs = await tx('B1 stranger router-swap: smart path sells one full 50k chunk', STRANGER, VID, 'router-swap', [await fresh()], (v) => ok(v) && v.includes('(amount u50000)') && v.includes('(unsold u0)'));
  const rt = routing(rs);
  check('B1 router-swap went through router 15aef66 smart-swap (print present)', js(rt), (v) => rt && rt.out === rs.f.out);
  check('B1 smart legs add up to 50k', `${rt['jing-in']}+${rt['dlmm-in']}+${rt['xyk-in']}+${rt['velar-in']}`, () => rt['jing-in'] + rt['dlmm-in'] + rt['xyk-in'] + rt['velar-in'] === 50000n);
  check('B1 smart out >= floor-out(sold - 8, limit)', `${rs.f.out} vs limit ${rs.f['limit-price']}`, () => rs.f.out >= ((50000n - 8n) * rs.f['limit-price']) / (PP * 100n));
  await ev('B1 router-swap: vault sBTC 50k, STX + out (fee 0: no Pyth transfer)', VID, `{ s: ${sbtcOf(VID)}, x: ${stxOf(VID)} }`, `(tuple (s u50000) (x u${vs + rs.f.out}))`);
  vs += rs.f.out;
  await tx('B1 same burn block: cooldown u16044', STRANGER, VID, 'router-swap', [UPD], '(err u16044)');
  await advance(1, 'B1 router cooldown');
  // router-swap-split (manual split, pool admin)
  await tx('B1 split that does not add up -> u16040', DEP, PID, 'router-swap-split', juice(0, [Cl.uint(50000), Cl.uint(40000), Cl.uint(0), Cl.uint(0), Cl.uint(0), await fresh()]), '(err u16040)');
  await tx('B1 split over the chunk cap -> u16039', DEP, PID, 'router-swap-split', juice(0, [Cl.uint(50001), Cl.uint(50001), Cl.uint(0), Cl.uint(0), Cl.uint(0), UPD]), '(err u16039)');
  const sp = await tx('B1 admin router-swap-split: manual 50k on the Jing leg', DEP, PID, 'router-swap-split', juice(0, [Cl.uint(50000), Cl.uint(50000), Cl.uint(0), Cl.uint(0), Cl.uint(0), await fresh()]), (v) => ok(v) && v.includes('(unsold u0)'));
  await ev('B1 vault empty, clock closed, ready to finish', VID, '{ e: (is-empty), c: (get-clock) }', (v) => v.includes('(e true)') && v.includes('(ready-to-finish true)') && v.includes('(batch-start none)'));
  vs += sp.f.out;
  await ev('B1 vault STX = jing-take + router-swap + split outs', VID, stxOf(VID), `u${vs}`);
  await cancelBid('B1');
  // finish (budget 0: no reserve)
  const pool0 = await read(stxOf(PID));
  const fin1 = await tx('B1 finalize-swap: vault finish sends everything (budget 0)', STRANGER, PID, 'finalize-swap', [cp(VID)], `(ok u${vs})`);
  void fin1;
  await ev('B1 pool STX + pot, vault keeps 0, stx-pot recorded', PID, `{ p: ${stxOf(PID)}, v: ${stxOf(VID)}, pot: (get-stx-pot u${R1} u0) }`, `(tuple (p u${pool0 + vs}) (pot u${vs}) (v u0))`);
  await pay(R1, 0, vs, sh1, 'B1');
  // keeper restake of the safe's payout
  if (ONLY.has('safe')) {
    await tx('stranger cannot restake (u4001)', STRANGER, SAFE, 'restake', [], '(err u4001)');
    const r = await tx('keeper (chavita) restakes exactly the payout, extend 0', DEP, SAFE, 'restake', [], (v) => v === `(ok (tuple (amount u${safeShare}) (cycles-to-extend u0)))`);
    void r;
    await ev('safe: pox-5 amount = 2,000 STX + payout, nothing unlocked', POX, `{ i: (get-staker-info '${SAFE}), a: (stx-account '${SAFE}) }`,
      (v) => v.includes(`(amount-ustx u${2000n * STX + safeShare})`) && v.includes('(unlocked u0)'));
    await ev('safe seat grows with the restake', PID, `(get-og-ustx '${SAFE})`, `u${2000n * STX + safeShare}`);
  }

  // ================= batch 2: Pyth fee u10, budget 2 x fee =================================
  const F2 = 120_000n;
  const sh2 = [[OG1, 1000n * STX], [ALICE, 3000n * STX]];
  await fixture('live Lazer oracle fee set to u10 (Eval in the oracle; governance not drivable)', ORACLE, `(begin (var-set fee u${FEE}) (get-fee))`, `u${FEE}`);
  const feeTo = await evRaw(ORACLE, '(get-fee-recipient)');
  check('oracle fee recipient', feeTo, (v) => /^S[PM]/.test(v));
  await rewards(PID, R2, F2, sh2);
  await tx('B2 claim cycle 143 -> vault (tranche 0 of a new cycle)', STRANGER, PID, 'pox-claim-rewards', [Cl.list([]), Cl.uint(R2), cp(VID)], (v) => ok(v) && v.includes(`(total-rewards u${F2})`));
  await ev('B2 0-STX caller', VID, stxOf(EMPTY), 'u0');
  await tx('B2 vault holds 0 STX: jing-place aborts, the oracle fee cannot be paid (err u1)', EMPTY, VID, 'jing-place', [await fresh()], '(err u1)');
  await sendStx(`B2 vault float ${FLOAT} uSTX`, STX_WHALE, VID, FLOAT);
  await tx('B2 float but budget 0: jing-place aborts on vault-mid with-stx allowance (err u0)', EMPTY, VID, 'jing-place', [await fresh()], '(err u0)');
  await tx(`B2 budget u${FEE - 1n} (fee - 1): still aborts (err u0)`, DEP, PID, 'set-vault-pyth-fee-budget', juice(0, [Cl.uint(FEE - 1n)]), '(ok true)');
  await tx('B2 budget fee - 1: jing-place aborts (err u0)', EMPTY, VID, 'jing-place', [await fresh()], '(err u0)');
  await tx(`B2 admin sets budget u${BUDGET} (= 2 x fee) through the pool`, DEP, PID, 'set-vault-pyth-fee-budget', juice(0, [Cl.uint(BUDGET)]), '(ok true)');
  const jp = await tx('B2 0-STX caller jing-place: the vault pays the one verify', EMPTY, VID, 'jing-place', [await fresh()], (v) => ok(v) && v.includes(`(amount u${F2})`));
  check('B2 jing-place: vault paid 1 x fee, caller paid nothing', js({ v: feeEvents(jp, VID, feeTo), c: stxTransfers(jp).filter((t) => t.sender === EMPTY) }), () =>
    feeEvents(jp, VID, feeTo).length === 1 && feeEvents(jp, VID, feeTo)[0] === FEE && !stxTransfers(jp).some((t) => t.sender === EMPTY));
  await advance(3, 'B2 patience window');
  await tx('B2 reclaim', EMPTY, VID, 'jing-reclaim', [], (v) => ok(v) && v.includes(`(amount u${F2})`));
  await stxBid(F2, 'B2');
  let v2 = await read(stxOf(VID));
  const jt2 = await tx('B2 admin jing-take 50k: vault pays 2 verifies', DEP, PID, 'jing-take', juice(0, [Cl.uint(50000), await fresh()]), ok);
  check('B2 jing-take: vault paid 2 x fee (vault-mid + market swap)', feeEvents(jt2, VID, feeTo).join(','), `${FEE},${FEE}`);
  await ev('B2 jing-take: vault STX = before + out - 2 fees', VID, stxOf(VID), `u${v2 + jt2.f.out - 2n * FEE}`);
  v2 = v2 + jt2.f.out - 2n * FEE;
  const rs2 = await tx('B2 0-STX caller router-swap (smart): sells a 50k chunk', EMPTY, VID, 'router-swap', [await fresh()], (v) => ok(v) && v.includes('(unsold u0)'));
  check('B2 router-swap: vault paid 2 x fee, caller sent no STX', js({ v: feeEvents(rs2, VID, feeTo), c: stxTransfers(rs2).filter((t) => t.sender === EMPTY).length }), () =>
    feeEvents(rs2, VID, feeTo).join(',') === `${FEE},${FEE}` && !stxTransfers(rs2).some((t) => t.sender === EMPTY));
  await ev('B2 caller still holds 0 STX', VID, stxOf(EMPTY), 'u0');
  // the router's out is net of the market verify it pays inside its own call; refresh-mid's fee is outside it
  await ev('B2 router-swap: vault STX = before + out - 1 fee (refresh-mid, outside the router)', VID, stxOf(VID), `u${v2 + rs2.f.out - FEE}`);
  v2 = v2 + rs2.f.out - FEE;
  await advance(1, 'B2 cooldown');
  const left2 = await read(sbtcOf(VID), VID);
  const sp2 = await tx(`B2 admin split: the last ${left2} sats on the Jing leg`, DEP, PID, 'router-swap-split', juice(0, [Cl.uint(left2), Cl.uint(left2), Cl.uint(0), Cl.uint(0), Cl.uint(0), await fresh()]), (v) => ok(v) && v.includes('(unsold u0)'));
  check('B2 split: vault paid 2 x fee', feeEvents(sp2, VID, feeTo).join(','), `${FEE},${FEE}`);
  await ev('B2 split: vault STX = before + out - 1 fee', VID, stxOf(VID), `u${v2 + sp2.f.out - FEE}`);
  v2 = v2 + sp2.f.out - FEE;
  await cancelBid('B2');
  const pool2 = await read(stxOf(PID));
  await tx(`B2 finalize: finish keeps the u${BUDGET} reserve`, STRANGER, PID, 'finalize-swap', [cp(VID)], `(ok u${v2 - BUDGET})`);
  await ev(`B2 vault keeps exactly u${BUDGET}; pool + pot`, PID, `{ v: ${stxOf(VID)}, p: ${stxOf(PID)} }`, `(tuple (p u${pool2 + v2 - BUDGET}) (v u${BUDGET}))`);
  await pay(R2, 0, v2 - BUDGET, sh2, 'B2');

  // ================= batch 3: no sale -> emergency-recover -> recovered sBTC ================
  const F3 = 100_000n;
  const sh3 = [[OG1, 1000n * STX], [ALICE, 3000n * STX]];
  await rewards(PID, R3, F3, sh3);
  await tx('B3 claim cycle 142 -> vault', STRANGER, PID, 'pox-claim-rewards', [Cl.list([]), Cl.uint(R3), cp(VID)], ok);
  await tx('B3 jing-place on the reserve (vault pays)', EMPTY, VID, 'jing-place', [await fresh()], ok);
  await tx('B3 emergency-recover too soon -> u16046', STRANGER, PID, 'emergency-recover', [cp(VID)], '(err u16046)');
  await advance(432, 'B3 RECOVERY_DELAY_BLOCKS');
  const pS = await read(sbtcOf(PID)), pX = await read(stxOf(PID));
  await tx('B3 emergency-recover by anyone: reclaims from Jing, sBTC + the STX reserve back to the pool', STRANGER, PID, 'emergency-recover', [cp(VID)],
    `(ok (tuple (sbtc u${F3}) (stx u${BUDGET - FEE})))`);
  await ev('B3 pool + 100k sBTC + reserve STX; vault empty; recovered pot', PID, `{ s: ${sbtcOf(PID)}, x: ${stxOf(PID)}, rp: (get-recovered-sbtc-pot u${R3} u0), sp: (get-stx-pot u${R3} u0), e: (contract-call? '${VID} is-empty), v: ${stxOf(VID)} }`,
    `(tuple (e true) (rp u${F3}) (s u${pS + F3}) (sp u${BUDGET - FEE}) (v u0) (x u${pX + BUDGET - FEE}))`);
  await tx('B3 pay-stx-stakers pays the recovered STX pot (the reserve)', STRANGER, PID, 'pay-stx-stakers', [Cl.list(sh3.map(([w]) => P(w))), Cl.uint(R3), Cl.uint(0)], ok);
  const tot3 = sh3.reduce((t, [, n]) => t + n, 0n);
  const before3 = {}; for (const [w] of sh3) before3[w] = await read(sbtcOf(w));
  const fees0 = await read('(get-earned-sbtc-fees)', PID);
  const pr = await tx('B3 pay-recovered-sbtc-stakers', STRANGER, PID, 'pay-recovered-sbtc-stakers', [Cl.list(sh3.map(([w]) => P(w))), Cl.uint(R3), Cl.uint(0)], ok);
  void pr;
  let feeSum = 0n, paid = 0n;
  for (const [w, n] of sh3) {
    const owed = (F3 * n) / tot3, cover = await read(`(get-og-ustx '${w})`, PID), taxed = n > cover ? n - cover : 0n;
    const fee = taxed === 0n ? 0n : (owed * 450n * taxed) / (BPS * n);
    feeSum += fee; paid += owed;
    await ev(`B3 ${w.slice(0, 6)} recovered sBTC = owed ${owed} - fee ${fee}`, PID, sbtcOf(w), `u${before3[w] + owed - fee}`);
  }
  await ev('B3 earned-sbtc-fees += the non-OG fee', PID, '(get-earned-sbtc-fees)', `u${fees0 + feeSum}`);
  await ev('B3 recovered tranche fully paid; residue = pot - owed', PID, `{ f: (is-recovered-tranche-fully-paid u${R3} u0), r: (get-recovered-sbtc-residue u${R3} u0) }`, `(tuple (f true) (r u${F3 - paid}))`);
  await tx('B3 replay pays nothing', STRANGER, PID, 'pay-recovered-sbtc-stakers', [Cl.list(sh3.map(([w]) => P(w))), Cl.uint(R3), Cl.uint(0)], '(ok u0)');
  if (F3 - paid > 0n) await tx('B3 sweep-recovered-sbtc-dust -> admin', DEP, PID, 'sweep-recovered-sbtc-dust', [Cl.uint(R3), Cl.uint(0)], `(ok u${F3 - paid})`);
  await tx('B3 sweep-recovered-sbtc-dust again -> u105', DEP, PID, 'sweep-recovered-sbtc-dust', [Cl.uint(R3), Cl.uint(0)], '(err u105)');
  await tx('stranger withdraw-sbtc-fees -> u100', STRANGER, PID, 'withdraw-sbtc-fees', [Cl.uint(1), P(STRANGER)], '(err u100)');
  const sf = await read('(get-earned-sbtc-fees)', PID);
  await tx('admin withdraw-sbtc-fees (all)', DEP, PID, 'withdraw-sbtc-fees', [Cl.uint(sf), P(DEP)], `(ok u${sf})`);
  const xf = await read('(get-earned-fees)', PID);
  await tx('admin withdraw-all-fees (STX fees from B1-B3)', DEP, PID, 'withdraw-all-fees', [P(DEP)], `(ok u${xf})`);
  await ev('pool fee ledgers empty', PID, '{ s: (get-earned-sbtc-fees), x: (get-earned-fees) }', '(tuple (s u0) (x u0))');
}

// pay-stx-stakers with exact per-staker accounting, replay, dust sweep.
async function pay(rc, trn, pot, shares, tag) {
  const tot = shares.reduce((t, [, n]) => t + n, 0n);
  const before = {}; for (const [w] of shares) before[w] = await read(stxOf(w), PID);
  const fees0 = await read('(get-earned-fees)', PID);
  await tx(`${tag} pay-stx-stakers before finalize of another tranche -> u115`, STRANGER, PID, 'pay-stx-stakers', [Cl.list([P(ALICE)]), Cl.uint(rc), Cl.uint(trn + 1)], '(err u115)');
  await tx(`${tag} pay-stx-stakers (anyone)`, STRANGER, PID, 'pay-stx-stakers', [Cl.list(shares.map(([w]) => P(w))), Cl.uint(rc), Cl.uint(trn)], ok);
  let fees = 0n, paid = 0n;
  for (const [w, n] of shares) {
    const owed = (pot * n) / tot, cover = await read(`(get-og-ustx '${w})`, PID), taxed = n > cover ? n - cover : 0n;
    const fee = taxed === 0n ? 0n : (owed * 450n * taxed) / (BPS * n);
    fees += fee; paid += owed;
    if (w === SAFE) safeShare = owed - fee;
    const bal = w === SAFE ? `(get unlocked (stx-account '${w}))` : stxOf(w);
    const base = w === SAFE ? 0n : before[w];
    await ev(`${tag} ${w.slice(0, 6)} paid owed ${owed} - fee ${fee} (cover ${cover}, shares ${n})`, PID, bal, `u${base + owed - fee}`);
  }
  await ev(`${tag} earned-fees += ${fees} (non-OG share only)`, PID, '(get-earned-fees)', `u${fees0 + fees}`);
  await ev(`${tag} tranche fully paid, residue = pot - owed`, PID, `{ f: (is-tranche-fully-paid u${rc} u${trn}), r: (get-tranche-residue u${rc} u${trn}) }`, `(tuple (f true) (r u${pot - paid}))`);
  await tx(`${tag} replay pays nothing`, STRANGER, PID, 'pay-stx-stakers', [Cl.list(shares.map(([w]) => P(w))), Cl.uint(rc), Cl.uint(trn)], '(ok u0)');
  await tx(`${tag} stranger cannot sweep dust (u100)`, STRANGER, PID, 'sweep-tranche-dust', [Cl.uint(rc), Cl.uint(trn)], '(err u100)');
  if (pot - paid > 0n) await tx(`${tag} sweep-tranche-dust -> admin`, DEP, PID, 'sweep-tranche-dust', [Cl.uint(rc), Cl.uint(trn)], `(ok u${pot - paid})`);
  await tx(`${tag} sweep again -> u105`, DEP, PID, 'sweep-tranche-dust', [Cl.uint(rc), Cl.uint(trn)], '(err u105)');
}

// User copies: canonical-hash onboarding, tampered copy refused, passkey transfer resets the keeper.
async function safeCopies() {
  const { generateP256Keypair, signChallengeWithRpId } = await import(resolve(PILLAR, 'lib-webauthn-test-signer.mjs'));
  const RP_ID = 'juiceofbtc.com';
  const H = (b) => createHash('sha256').update(b).digest();
  const cvh = (cv) => H(Buffer.from(serializeCV(cv).replace(/^0x/, ''), 'hex'));
  const domain = (w) => cvh(tupleCV({ name: stringAsciiCV('smart-wallet-standard'), version: stringAsciiCV('1.0.0'), 'chain-id': uintCV(1), wallet: principalCV(w) }));
  const challenge = (t, w) => H(Buffer.concat([Buffer.from('534950303138', 'hex'), domain(w), cvh(t)]));
  const strip = (h) => h.replace(/^0x/, '');
  const sigAuth = (authId, pub, s) => tupleCV({ 'auth-id': uintCV(authId), pubkey: bufferCV(Buffer.from(strip(pub), 'hex')), signature: bufferCV(Buffer.from(strip(s.signatureHex), 'hex')),
    'authenticator-data': bufferCV(Buffer.from(strip(s.authenticatorDataHex), 'hex')), 'client-data-prefix': bufferCV(Buffer.from(strip(s.clientDataPrefixHex), 'hex')), 'client-data-suffix': bufferCV(Buffer.from(strip(s.clientDataSuffixHex), 'hex')) });
  const T = template('juice-autostake-safe');
  const onboard = (pub) => [Cl.buffer(Buffer.from(pub, 'hex')), P(OWNER), P(RECOVERY), Cl.uint(100_000_000), Cl.uint(100_000), Cl.uint(144)];
  await deploy('mallory-autostake-safe', { body: T.body + '\n;; one extra byte\n', form: 'template + one comment line (tampered)' }, ClarityVersion.Clarity6, FAKFUN_DEPLOYER);
  await tx('tampered copy onboard -> refused by core-v2 (hash mismatch)', FAKFUN_DEPLOYER, `${FAKFUN_DEPLOYER}.mallory-autostake-safe`, 'onboard', onboard('02' + 'ef'.repeat(32)), (v) => v.startsWith('(err'));
  const BOB = `${FAKFUN_DEPLOYER}.bob-autostake-safe`;
  await deploy('bob-autostake-safe', { body: T.body, form: 'template bytes, relay user copy' }, ClarityVersion.Clarity6, FAKFUN_DEPLOYER);
  const key = generateP256Keypair();
  await tx('user copy onboards on the canonical hash (own passkey)', FAKFUN_DEPLOYER, BOB, 'onboard', onboard(strip(key.pubKeyHex)), ok);
  await sendStx('fund the user copy 300 STX', STX_WHALE, BOB, 300n * STX);
  await tx('owner stakes 200 STX from the user copy', OWNER, BOB, 'stake-stx-juice', [Cl.uint(200n * STX), Cl.none(), Cl.none(), Cl.none()], ok);
  await tx('owner sets keeper RANDOM', OWNER, BOB, 'set-keeper', [P(RANDOM), Cl.none(), Cl.none()], ok);
  await tx('owner proposes transfer to RECIPIENT', OWNER, BOB, 'propose-transfer-wallet', [P(RECIPIENT)], ok);
  const t = tupleCV({ topic: stringAsciiCV('confirm-transfer'), 'auth-id': uintCV(21), 'new-admin': principalCV(RECIPIENT) });
  const s = signChallengeWithRpId(challenge(t, BOB), key.privKey, RP_ID);
  await tx('relayer submits the passkey confirm-transfer-wallet', RELAYER, BOB, 'confirm-transfer-wallet', [sigAuth(21, key.pubKeyHex, s), Cl.none()], ok);
  await ev('owner is RECIPIENT and the keeper reset to RECIPIENT (611873c)', BOB, '{ o: (get-owner), k: (get-keeper) }', `(tuple (k ${RECIPIENT}) (o (ok ${RECIPIENT})))`);
  await tx('old keeper RANDOM restake -> u4001', RANDOM, BOB, 'restake', [], '(err u4001)');
  await tx('chavita restake -> u4001', DEP, BOB, 'restake', [], '(err u4001)');
  await tx('old owner set-keeper -> u4001', OWNER, BOB, 'set-keeper', [P(DEP), Cl.none(), Cl.none()], '(err u4001)');
  await tx('new owner sets chavita as keeper', RECIPIENT, BOB, 'set-keeper', [P(DEP), Cl.none(), Cl.none()], ok);
  await tx('chavita restakes the free 100 STX for the new owner', DEP, BOB, 'restake', [], (v) => ok(v) && v.includes(`(amount u${100n * STX})`));
  await ev('user copy: 300 STX staked with the pool, nothing unlocked', POX, `{ i: (get-staker-info '${BOB}), a: (stx-account '${BOB}) }`, (v) => v.includes(PID) && v.includes(`(amount-ustx u${300n * STX})`) && v.includes('(unlocked u0)'));
}

// OG rotation: HOP + OG1 unstake, the lock ends, HOP is evicted, OG1 re-stakes 1 STX (shrink).
async function juiceCrossing(C) {
  const og = (label, seats, covered) => ev(label, PID, '(get-og-status)', (v) => v.includes(`(seats u${seats})`) && v.includes(`(covered-ustx u${covered})`));
  const st0 = await evRaw(PID, '(get-og-status)');
  const seats0 = Number(U(st0.match(/\(seats u\d+\)/)[0])), cov0 = U(st0.match(/\(covered-ustx u\d+\)/)[0]);
  notes.push(`before the crossing: ${seats0} seats, ${cov0} uSTX covered (OG1, HOP, the safe, the user copy)`);
  if (cycleOf() !== C) notes.push(`crossing starts in cycle ${cycleOf()}, not ${C}`);
  await tx('HOP unstakes', HOP, POX, 'unstake', [cp(PID)], ok);
  await tx('OG1 unstakes', OG1, POX, 'unstake', [cp(PID)], ok);
  await ev('HOP still staying until the lock ends', PID, `(og-staying '${HOP})`, 'true');
  await tx('evict-og HOP while staying -> u129', STRANGER, PID, 'evict-og', [P(HOP)], '(err u129)');
  await tx('evict-og of a never-seated staker -> u128', STRANGER, PID, 'evict-og', [P(ALICE)], '(err u128)');
  const target = (cycleOf() + 1) * CYCLE + FIRST_BURN + 20;
  await advance(target - burn, `into cycle ${cycleOf() + 1}: the HOP and OG1 locks end`);
  await ev('pox-5: HOP has no position', POX, `(get-staker-info '${HOP})`, 'none');
  await ev('og-staying HOP false', PID, `(og-staying '${HOP})`, 'false');
  const ev1 = await tx('stranger evict-og HOP after the payout: the 200k cover goes back to the cap', STRANGER, PID, 'evict-og', [P(HOP)], '(ok u200000000000)');
  check('og-evict print', printsOf(ev1, PID).join(' | '), (v) => v.includes('og-evict') && v.includes('(freed-ustx u200000000000)'));
  await og(`${seats0 - 1} seats after the evict, 200k STX back to the cap`, seats0 - 1, cov0 - 200_000n * STX);
  const sh = await tx('OG1 stakes 1 STX fresh before anyone evicts it (Patient Reed)', OG1, POX, 'stake', [cp(PID), Cl.uint(STX), Cl.uint(96), Cl.uint(burn), Cl.none()], ok);
  check('og-shrink print: cover 1 STX, freed 999 STX', printsOf(sh, PID).join(' | '), (v) => v.includes('og-shrink') && v.includes(`(covered-ustx u${STX})`) && v.includes(`(freed-ustx u${999n * STX})`));
  await ev('OG1 keeps its seat at 1 STX', PID, `{ c: (get-og-ustx '${OG1}), o: (is-og '${OG1}) }`, `(tuple (c u${STX}) (o true))`);
  await og('cover shrank by 999 STX: freed room back to the cap', seats0 - 1, cov0 - 200_000n * STX - 999n * STX);
  await ev('OG1 fee on a 1,000 STX share is charged above the 1 STX cover', PID, `(get-staker-fee '${OG1} u${1000n * STX} u1000000 u450)`, `u${(1000000n * 450n * (999n * STX)) / (BPS * 1000n * STX)}`);
  await tx('raise-og-cap by a stranger -> u100', STRANGER, PID, 'raise-og-cap', [Cl.uint(3_000_000n * STX)], '(err u100)');
  await tx('raise-og-cap lower -> u127', DEP, PID, 'raise-og-cap', [Cl.uint(STX)], '(err u127)');
}

// =========================================================================================
// Fast Pool: 96-cycle lock, claim, fund, place, router-swap + split, finish reserve.
async function fastpool() {
  const fv = cp(FVAULT);
  await tx('FP register-self by a stranger -> u1001', STRANGER, FPOOL, 'register-self', await grantFor(FPOOL, 9), '(err u1001)');
  await tx('FP register-self (Fast Pool deployer = admin)', FP, FPOOL, 'register-self', await grantFor(FPOOL, 9), ok);
  await sendStx('fund FS1 101 STX', STX_WHALE, FS1, 101n * STX);
  await sendStx('fund FS2 101 STX', STX_WHALE, FS2, 101n * STX);
  await tx('FS1 stakes 100 STX for 96 cycles: validate-stake! accepts (3f82a93)', FS1, POX, 'stake', [cp(FPOOL), Cl.uint(100n * STX), Cl.uint(96), Cl.uint(burn), Cl.none()], ok);
  await tx('FS2 stakes 100 STX for 13 cycles (was the first refused length)', FS2, POX, 'stake', [cp(FPOOL), Cl.uint(100n * STX), Cl.uint(13), Cl.uint(burn), Cl.none()], ok);
  await ev('FS1 locked 96 cycles at the Fast Pool signer', POX, `(get-staker-info '${FS1})`, (v) => v.includes(FPOOL) && v.includes('(num-cycles u96)'));
  const next = cycleOf() + 1;
  await ev('FS1 share mirrored in the signer for the 96th cycle', FPOOL, `(contract-call? '${POX} get-staker-shares-staked-for-cycle '${FS1} u${next + 95} none '${FPOOL})`, `u${100n * STX}`);
  // reward cycle fixture (shares mirrored through validate-stake!, as pox-5 would)
  const RC = 144, F = 100_000n;
  await tx(`real sBTC into pox-5 backs Fast Pool cycle ${RC}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(F), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
  const key = `{reward-cycle:u${RC},bond-index:none,signer:'${FPOOL}}`;
  await fixture(`Fast Pool cycle ${RC} earned ${F} sats, FS1 1 share, mirrored via validate-stake!`, POX, `(begin
    (map-set signer-shares-staked-for-cycle ${key} u1)
    (map-set signer-pending-staked-ustx-per-cycle {signer:'${FPOOL},cycle:u${RC}} u1)
    (map-set signer-rewards-per-token-settled-for-cycle ${key} (get-rewards-per-token-for-cycle u${RC} none))
    (map-set signer-unclaimed-rewards-for-cycle ${key} u${F})
    (map-set staker-shares-staked-for-cycle {reward-cycle:u${RC},bond-index:none,signer:'${FPOOL},staker:'${FS1}} u1)
    (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${F}))
    (try! (contract-call? '${FPOOL} validate-stake! '${FS1} u${RC} u1 u1 u0 false none)) (ok true))`, '(ok true)');
  await tx('FP set-vault-window-blocks u3 (admin, vault idle)', FP, FPOOL, 'set-vault-window-blocks', [Cl.uint(3), fv], '(ok true)');
  await tx('FP set-vault-max-chunk-sats u50000', FP, FPOOL, 'set-vault-max-chunk-sats', [Cl.uint(50000), fv], '(ok true)');
  await tx(`FP set-vault-pyth-fee-budget u${BUDGET} (fee u10 is live on the fork)`, FP, FPOOL, 'set-vault-pyth-fee-budget', [Cl.uint(BUDGET), fv], '(ok true)');
  await sendStx(`FP vault float ${FLOAT} uSTX`, STX_WHALE, FVAULT, FLOAT);
  await tx('FP claim-rewards (anyone)', STRANGER, FPOOL, 'claim-rewards', [Cl.uint(RC)], `(ok u${F})`);
  await tx('FP fund-swap-vault (anyone)', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(RC), fv], `(ok u${F})`);
  await ev('FP vault holds the pot', FVAULT, sbtcOf(FVAULT), `u${F}`);
  await tx('FP jing-place (0-STX caller, the vault pays)', EMPTY, FVAULT, 'jing-place', [await fresh()], (v) => ok(v) && v.includes(`(amount u${F})`));
  await advance(3, 'FP patience window');
  await tx('FP jing-reclaim', EMPTY, FVAULT, 'jing-reclaim', [], ok);
  await stxBid(F, 'FP');
  const feeTo = await evRaw(ORACLE, '(get-fee-recipient)');
  let vs = await read(stxOf(FVAULT));
  const rs = await tx('FP 0-STX caller router-swap (smart path) sells a 50k chunk', EMPTY, FVAULT, 'router-swap', [await fresh()], (v) => ok(v) && v.includes('(amount u50000)') && v.includes('(unsold u0)'));
  check('FP router-swap: vault paid 2 x fee, caller none', feeEvents(rs, FVAULT, feeTo).join(','), `${FEE},${FEE}`);
  check('FP router print from 15aef66: legs add to 50k', js(routing(rs)), () => { const r = routing(rs); return r && r['jing-in'] + r['dlmm-in'] + r['xyk-in'] + r['velar-in'] === 50000n; });
  await ev('FP vault STX = before + out - 1 fee', FVAULT, stxOf(FVAULT), `u${vs + rs.f.out - FEE}`);
  vs += rs.f.out - FEE;
  await advance(1, 'FP cooldown');
  await tx('FP stranger router-swap-split -> u1001', STRANGER, FPOOL, 'router-swap-split', [Cl.uint(50000), Cl.uint(50000), Cl.uint(0), Cl.uint(0), Cl.uint(0), await fresh(), fv], '(err u1001)');
  const sp = await tx('FP admin router-swap-split: manual 50k on the Jing leg', FP, FPOOL, 'router-swap-split', [Cl.uint(50000), Cl.uint(50000), Cl.uint(0), Cl.uint(0), Cl.uint(0), await fresh(), fv], (v) => ok(v) && v.includes('(unsold u0)'));
  check('FP split: vault paid 2 x fee', feeEvents(sp, FVAULT, feeTo).join(','), `${FEE},${FEE}`);
  vs += sp.f.out - FEE;
  await ev('FP vault empty; STX matches the two sales', FVAULT, `{ e: (is-empty), x: ${stxOf(FVAULT)} }`, `(tuple (e true) (x u${vs}))`);
  await cancelBid('FP');
  const p0 = await read(stxOf(FPOOL));
  await tx(`FP finalize-swap-vault: finish keeps the u${BUDGET} reserve`, STRANGER, FPOOL, 'finalize-swap-vault', [fv], ok);
  await ev(`FP vault keeps u${BUDGET}, signer + the rest`, FPOOL, `{ v: ${stxOf(FVAULT)}, p: ${stxOf(FPOOL)} }`, `(tuple (p u${p0 + vs - BUDGET}) (v u${BUDGET}))`);
  const s0 = await read(`(get unlocked (stx-account '${FS1}))`);
  await tx('FP distribute-rewards-many([FS1]) pays the whole pot (fee 0, 1 of 1 share)', STRANGER, FPOOL, 'distribute-rewards-many', [Cl.list([P(FS1)]), Cl.uint(RC)], ok);
  await ev('FS1 unlocked STX + the whole pot', FPOOL, `(get unlocked (stx-account '${FS1}))`, `u${s0 + vs - BUDGET}`);
}
async function grantFor(signer, authId) {
  const priv = randomPrivateKey(), key = privateKeyToPublic(priv);
  const [a, n] = POX.split('.');
  const r = await (await fetch(`${NODE}/v2/contracts/call-read/${a}/${n}/get-signer-grant-message-hash`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sender: DEP, arguments: [cp(signer), Cl.uint(authId)].map((c) => '0x' + serializeCV(c).replace(/^0x/, '')) }) })).json();
  const sig = signMessageHashRsv({ messageHash: r.result.replace(/^0x/, '').slice(2 + 8), privateKey: priv });
  return [cp(signer), Cl.buffer(Buffer.from(key.replace(/^0x/, ''), 'hex')), Cl.uint(authId), Cl.buffer(Buffer.from(sig.replace(/^0x/, ''), 'hex'))];
}

// =========================================================================================
// ccd016: fund-from-treasury, jing-place, router-swap after the window, dust -> fresh window.
async function ccd016() {
  const PROXY_SRC = `
(define-public (allow-sbtc) (contract-call? '${TREASURY} set-allowed '${SBTC} true))
(define-public (set-window (blocks uint)) (contract-call? '${CCD} set-window-blocks blocks))
(define-public (set-budget (ustx uint)) (contract-call? '${CCD} set-pyth-fee-budget ustx))
(define-public (take (amount uint) (update (buff 8192))) (contract-call? '${CCD} jing-take amount update))
`;
  await deploy('sim-ccip-proxy', { body: PROXY_SRC, form: 'sim-only proxy playing a passed CCIP proposal' }, ClarityVersion.Clarity5, DAO);
  await tx('stranger set-window-blocks -> u16000 (DAO only)', STRANGER, CCD, 'set-window-blocks', [Cl.uint(3)], '(err u16000)');
  await fixture('base-dao set-extensions: ccd016 + the proposal proxy enabled', BASE_DAO, `(begin (map-set Extensions '${CCD} true) (map-set Extensions '${PROXY} true) (and (is-extension '${CCD}) (is-extension '${PROXY})))`, 'true');
  await tx('proxy: treasury allows sBTC', DAO, PROXY, 'allow-sbtc', [], ok);
  await tx('proxy: set-window-blocks u3', DAO, PROXY, 'set-window', [Cl.uint(3)], '(ok true)');
  await tx(`proxy: set-pyth-fee-budget u${BUDGET}`, DAO, PROXY, 'set-budget', [Cl.uint(BUDGET)], '(ok true)');
  await sendStx(`ccd016 STX float ${FLOAT} uSTX`, STX_WHALE, CCD, FLOAT);
  const tr0 = await read(sbtcOf(TREASURY));
  const F = 100_000n;
  await tx('MIA rewards: 100k sats into the treasury', SBTC_WHALE, SBTC, 'transfer', [Cl.uint(F), P(SBTC_WHALE), P(TREASURY), Cl.none()], '(ok true)');
  await tx('fund-from-treasury (anyone): pulls the whole treasury, opens the window', STRANGER, CCD, 'fund-from-treasury', [], (v) => ok(v) && v.includes(`(amount u${tr0 + F})`) && v.includes('(opened true)'));
  await ev('treasury emptied, vault holds it', CCD, `{ t: ${sbtcOf(TREASURY)}, v: ${sbtcOf(CCD)} }`, `(tuple (t u0) (v u${tr0 + F}))`);
  await tx('ccd016 jing-place (0-STX caller; the vault pays the verify)', EMPTY, CCD, 'jing-place', [await fresh()], (v) => ok(v) && v.includes(`(amount u${tr0 + F})`));
  await tx('router-swap inside the window -> u16031', EMPTY, CCD, 'router-swap', [await fresh()], '(err u16031)');
  await advance(3, 'ccd016 window');
  await tx('jing-reclaim after the window (anyone)', EMPTY, CCD, 'jing-reclaim', [Cl.none()], ok);
  await stxBid(tr0 + F, 'ccd016');
  const feeTo = await evRaw(ORACLE, '(get-fee-recipient)');
  const x0 = await read(stxOf(CCD));
  const rs = await tx('ccd016 router-swap after the window: the whole batch through router 15aef66', EMPTY, CCD, 'router-swap', [await fresh()], (v) => ok(v) && v.includes(`(amount u${tr0 + F})`) && v.includes('(unsold u0)'));
  check('ccd016 router-swap: vault paid 2 x fee, caller none', feeEvents(rs, CCD, feeTo).join(','), `${FEE},${FEE}`);
  check('ccd016 router print legs add up', js(routing(rs)), () => { const r = routing(rs); return r && r['jing-in'] + r['dlmm-in'] + r['xyk-in'] + r['velar-in'] === tr0 + F; });
  await ev('ccd016 STX = before + out - 1 fee; empty; clock cleared', CCD, `{ x: ${stxOf(CCD)}, e: (is-empty), c: (var-get batch-start) }`, `(tuple (c none) (e true) (x u${x0 + rs.f.out - FEE}))`);
  await cancelBid('ccd016');
  const b0 = await read(stxOf(BOOK));
  await tx(`fuel-fair-book: the STX (minus the u${BUDGET} reserve) to ccd015`, STRANGER, CCD, 'fuel-fair-book', [], ok);
  await ev('ccd015 book received it; ccd016 keeps the reserve', CCD, `{ b: ${stxOf(BOOK)}, v: ${stxOf(CCD)} }`, `(tuple (b u${b0 + x0 + rs.f.out - FEE - BUDGET}) (v u${BUDGET}))`);
  // ---- 8adfa68: an elapsed window kept alive by <= 8 sats of dust opens fresh ----
  await tx('D 3 sats land in the treasury', SBTC_WHALE, SBTC, 'transfer', [Cl.uint(3), P(SBTC_WHALE), P(TREASURY), Cl.none()], '(ok true)');
  await tx('D empty vault: funding opens (opened true)', STRANGER, CCD, 'fund-from-treasury', [], (v) => ok(v) && v.includes('(amount u3)') && v.includes('(opened true)'));
  await advance(1, 'D one block');
  await tx('D 5 sats land in the treasury', SBTC_WHALE, SBTC, 'transfer', [Cl.uint(5), P(SBTC_WHALE), P(TREASURY), Cl.none()], '(ok true)');
  await tx('D window open: funding joins (opened false)', STRANGER, CCD, 'fund-from-treasury', [], (v) => ok(v) && v.includes('(amount u5)') && v.includes('(opened false)'));
  await advance(3, 'D window elapses on 8 sats');
  await ev('D elapsed on 8 sats of dust, not empty', CCD, '{ e: (window-elapsed), s: (get sbtc-balance (get-status)), m: (is-empty) }', '(tuple (e true) (m false) (s u8))');
  await tx('D router-swap on 8 dust sats -> below the slack (err)', EMPTY, CCD, 'router-swap', [await fresh()], (v) => v.startsWith('(err'));
  await tx('D new rewards 100k sats in the treasury', SBTC_WHALE, SBTC, 'transfer', [Cl.uint(F), P(SBTC_WHALE), P(TREASURY), Cl.none()], '(ok true)');
  await tx('D elapsed + dust: funding opens a FRESH window (8adfa68)', STRANGER, CCD, 'fund-from-treasury', [], (v) => ok(v) && v.includes(`(amount u${F})`) && v.includes('(opened true)'));
  await ev('D batch-start is this block, window open', CCD, '{ b: (is-eq (var-get batch-start) (some burn-block-height)), o: (window-open) }', '(tuple (b true) (o true))');
  await tx('D the new rewards are not router-swapped at once (u16031)', EMPTY, CCD, 'router-swap', [await fresh()], '(err u16031)');
  await advance(3, 'D window elapses on 100,008 sats');
  await tx('D 1 sat lands', SBTC_WHALE, SBTC, 'transfer', [Cl.uint(1), P(SBTC_WHALE), P(TREASURY), Cl.none()], '(ok true)');
  await tx('D elapsed + MORE than 8 sats: funding joins (opened false; no 1-sat re-arm)', STRANGER, CCD, 'fund-from-treasury', [], (v) => ok(v) && v.includes('(amount u1)') && v.includes('(opened false)'));
  await ev('D window still elapsed', CCD, '(window-elapsed)', 'true');
}

// =========================================================================================
// Router 15aef66: limit-aware smart pick, then (last: 1.5M s of block time) the core migration.
async function router() {
  const WY = STX_WHALE;
  const sbtcPools = async () => [...String(await evRaw(ROUTER, `(list ${DLMM_POOLS.map((d) => sbtcOf(d)).join(' ')})`)).matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
  const prices = [...String(await evRaw(ROUTER, `(list ${DLMM_POOLS.map((d) => `(let ((p (unwrap-panic (contract-call? '${d} get-pool)))) (unwrap-panic (contract-call? DLMM_CORE get-bin-price (get initial-price p) (get bin-step p) (get active-bin-id p))))`).join(' ')})`)).matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
  const depth = await sbtcPools();
  const deepest = depth.indexOf(depth.reduce((a, b) => (b > a ? b : a)));
  const A = 5_000_000_000n;
  // scan limits: the smart pick must have capacity inside the limit; find one where the blind pick has none
  let pick = null;
  for (const pct of [100n, 101n, 102n, 103n, 105n, 108n, 112n, 120n]) {
    const limit = (10_000_000_000n * PP / prices[deepest]) * pct / 100n;
    const smart = U(await evRaw(ROUTER, `(dlmm-pick false u${A} u${limit})`)), blind = U(await evRaw(ROUTER, `(dlmm-pick false u${A} u0)`));
    const caps = [...String(await evRaw(ROUTER, `(list ${[1, 2, 3].map((n) => `(dlmm-capacity u${limit} false u${n})`).join(' ')})`)).matchAll(/u(\d+)/g)].map((m) => BigInt(m[1]));
    const row = { pct: String(pct), limit: String(limit), smart: String(smart), blind: String(blind), caps: caps.map(String) };
    notes.push({ routerPickScan: row });
    console.log('  pick scan', JSON.stringify(row));
    check(`router: at limit ${pct}% the smart pick v-${smart} has capacity inside the limit (or none does)`, caps.join('/'), () => caps[Number(smart) - 1] > 0n || caps.every((c) => c === 0n));
    if (!pick && caps[Number(blind) - 1] === 0n && caps[Number(smart) - 1] > 0n) pick = { limit, smart, blind, caps, pct };
  }
  const L = pick?.limit ?? (10_000_000_000n * PP / prices[deepest]) * 102n / 100n;
  if (pick) check(`router: limit-aware pick matters at ${pick.pct}% (blind v-${pick.blind} has 0 capacity, smart v-${pick.smart} has ${pick.caps[Number(pick.smart) - 1]})`, 'found', 'found');
  else notes.push('router: at this fork no scanned limit separates the blind and the limit-aware DLMM pick; the swap below runs at 102% and asserts the pick has capacity');
  const taker = mk(771);
  await sendStx('router taker 5,010 STX', WY, taker, A + 10n * STX);
  const s0 = await sbtcPools();
  const sw = await tx(`router: smart 5,000 STX -> sBTC at limit ${L} (update none)`, taker, ROUTER, 'smart-swap-stx-for-sbtc', [Cl.uint(A), Cl.uint(L), Cl.none(), Cl.uint(1), Cl.uint(0)], ok);
  const s1 = await sbtcPools();
  const smartN = Number(U(await evRaw(ROUTER, `(dlmm-pick false u${A} u${L})`)));
  check('router: smart DLMM leg filled on a pool with capacity (dlmm-in > 0 iff capacity)', `dlmm-in ${sw.f['dlmm-in']}, moved ${s0.map((x, j) => String(x - s1[j])).join('/')}`, () => (sw.f['dlmm-in'] ?? 0n) === 0n || s0[smartN - 1] - s1[smartN - 1] >= 0n);
  if (pick) check('router: the DLMM fill came from the limit-aware pick, not the blind one', `${s0.map((x, j) => String(x - s1[j])).join('/')}`, () => s0[Number(pick.blind) - 1] === s1[Number(pick.blind) - 1]);
  // ---- core migration (Bitflow's own path, as the real admin) ----
  const [ca, cn] = DLMM_CORE_ID.split('.');
  const coreSrc = (await (await fetch(`${NODE}/v2/contracts/source/${ca}/${cn}?proof=0`)).json()).source;
  await deploy('dlmm-core-v-1-2', { body: coreSrc, form: 'live dlmm-core-v-1-1 source (migration target)' }, ClarityVersion.Clarity5);
  const TARGET = `${DEP}.dlmm-core-v-1-2`;
  const enabled = () => evRaw(ROUTER, `(list ${DLMM_POOLS.map((d, j) => `(dlmm-enabled '${d} u${DLMM_POOL_IDS[j]})`).join(' ')})`);
  await ev('all three DLMM pools enabled before', ROUTER, `(list ${DLMM_POOLS.map((d, j) => `(dlmm-enabled '${d} u${DLMM_POOL_IDS[j]})`).join(' ')})`, '(list true true true)');
  const n = Number(U(await evRaw(ROUTER, `(dlmm-pick false u${A} u${L})`)));
  const pool = DLMM_POOLS[n - 1];
  await sendStx('fund the Bitflow admin 10 STX', WY, DLMM_ADMIN, 10n * STX);
  await tx(`claim-protocol-fees v-${n}`, DLMM_ADMIN, DLMM_CORE_ID, 'claim-protocol-fees', [cp(pool), cp(WSTX), cp(SBTC)], '(ok true)');
  const f = String(await evRaw(ROUTER, '(unwrap-panic (unwrap-panic (contract-call? DLMM_CORE get-bin-factors-by-step u15)))'));
  const factors = [...f.matchAll(/u(\d+)/g)].map((m) => Cl.uint(BigInt(m[1])));
  await tx('target core add-bin-step u15', DLMM_ADMIN, TARGET, 'add-bin-step', [Cl.uint(15), Cl.list(factors)], '(ok true)');
  await tx('target core set-core-migration-source', DLMM_ADMIN, TARGET, 'set-core-migration-source', [cp(DLMM_CORE_ID)], '(ok true)');
  await tx('dlmm-core-v-1-1 set-core-migration-target', DLMM_ADMIN, DLMM_CORE_ID, 'set-core-migration-target', [cp(TARGET)], '(ok true)');
  const adv = await step({ AdvanceBlocks: { bitcoin_blocks: 3, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 500_000 } });
  check('advance 3 x 500,000 s (migration cooldown)', JSON.stringify(adv).includes('Ok') ? 'ok' : JSON.stringify(adv).slice(0, 200), 'ok');
  burn += 3;
  await tx(`migrate-pool v-${n} -> dlmm-core-v-1-2`, DLMM_ADMIN, DLMM_CORE_ID, 'migrate-pool', [cp(pool), cp(TARGET)], '(ok true)');
  const want = ['true', 'true', 'true']; want[n - 1] = 'false';
  check(`router 15aef66 dlmm-enabled skips migrated v-${n} (core-address check)`, await enabled(), `(list ${want.join(' ')})`);
  check(`smart + manual picks skip v-${n}`, `${await evRaw(ROUTER, `(dlmm-pick false u${A} u${L})`)} / ${await evRaw(ROUTER, `(dlmm-pick false u${A} u0)`)}`, (v) => !v.includes(`u${n} `) && !v.endsWith(`u${n}`));
  const t2 = mk(772);
  await sendStx('router taker 2: 10,020 STX', WY, t2, 2n * A + 20n * STX);
  const m0 = await sbtcPools();
  await tx('router: smart 5,000 STX after the migration fills (no u1060 revert)', t2, ROUTER, 'smart-swap-stx-for-sbtc', [Cl.uint(A), Cl.uint(L * 3n / 2n), Cl.none(), Cl.uint(1), Cl.uint(0)], ok);
  await tx('router: manual 5,000 STX DLMM leg fills on the next pool', t2, ROUTER, 'swap-stx-for-sbtc', [Cl.uint(A), Cl.uint(0), Cl.uint(1), Cl.none(), Cl.none(), tupleCV({ dlmm: uintCV(A), xyk: uintCV(0), velar: uintCV(0) }), tupleCV({ dlmm: uintCV(0), xyk: uintCV(0), velar: uintCV(0) }), Cl.uint(0)], ok);
  const m1 = await sbtcPools();
  check(`no sBTC left migrated v-${n}`, String(m0[n - 1] - m1[n - 1]), '0');
}

main().catch((e) => { console.error(e.message ?? e); save({ error: String(e.message ?? e) }); process.exit(1); });
