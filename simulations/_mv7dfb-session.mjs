// _mv7dfb-session.mjs - interactive stxer session helpers for the mv7dfb
// coverage harnesses (same mechanics as verify-deploy-set-mv7dfb.js): one
// session, every step posted on its own, checks stop on the first failure
// (SOFT=1 keeps going), deploys from deploy-bytes-mv7dfb/ under any sender.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Cl, ClarityVersion, deserializeCV, cvToString, serializeCV, getAddressFromPrivateKey, randomPrivateKey, privateKeyToPublic,
  signMessageHashRsv, makeUnsignedContractDeploy, makeUnsignedSTXTokenTransfer, PostConditionMode, tupleCV as rawTupleCV,
} from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

export { Cl, ClarityVersion, cvToString, deserializeCV, serializeCV };
export const NODE = process.env.STACKS_API_URL || 'http://77.42.3.101/stacks-api';
export const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
export const POX = 'SP000000000000000000002Q6VF78.pox-5';
export const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
export const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
export const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`, ROUTER = `${DEP}.swap-router-sbtc-stx-jing-v5-3`, CORE = `${DEP}.jing-core-v6`;
export const ORACLE = 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle';
export const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', STX_WHALE = 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR';
export const FIRST_BURN = 666050, CYCLE = 2100, STX = 1_000_000n, PP = 100_000_000n, BPS = 10_000n;
export const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const sha512_256 = (s) => createHash('sha512-256').update(s).digest('hex');
export const bytes = (name) => fs.readFileSync(new URL(`./deploy-bytes-mv7dfb/${name}.clar`, import.meta.url), 'utf8');
export const U = (s) => { const m = /u(\d+)/.exec(String(s)); if (!m) throw new Error(`no uint in ${s}`); return BigInt(m[1]); };
export const ok = (v) => String(v).startsWith('(ok');
export const err = (v) => String(v).startsWith('(err');
export const cp = (id) => Cl.contractPrincipal(...id.split('.'));
export const P = (s) => Cl.principal(s);
export const sbtcOf = (who) => `(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`;
export const stxOf = (who) => `(stx-get-balance '${who})`;
export const tupleCV = (f) => rawTupleCV(Object.fromEntries(Object.entries(f).sort(([a], [b]) => a.localeCompare(b))));
export const js = (o) => JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? String(v) : v));
export function fields(s) {
  const o = {};
  for (const m of String(s).matchAll(/\(([a-z0-9-]+) (u\d+|true|false)\)/g)) o[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : BigInt(m[2].slice(1));
  return o;
}
const decode = (r) => {
  if (r?.Eval?.Ok !== undefined) return cvToString(deserializeCV(r.Eval.Ok));
  if (r?.Transaction?.Ok) { const t = r.Transaction.Ok; if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t).slice(0, 400)}`; return cvToString(deserializeCV(t.result)); }
  return `ENGINE-ERR ${JSON.stringify(r).slice(0, 400)}`;
};

export function session(name) {
  const S = { sid: null, checks: [], notes: [], fixtures: [], sources: {}, burn: 0, ops: 0, lz: null, UPD: null, MID: 0n };
  S.url = () => `https://stxer.xyz/simulations/mainnet/${S.sid}`;
  S.save = (extra = {}) => {
    const dir = new URL('./fixtures/', import.meta.url);
    fs.writeFileSync(new URL(`${name}-result.json`, dir), js({ simulation: S.url(), passed: S.checks.filter((c) => c.passed).length, total: S.checks.length,
      sources: S.sources, fixtures: S.fixtures, notes: S.notes, ...extra, checks: S.checks }, null, 2) + '\n');
  };
  S.check = (label, actual, want) => {
    const passed = typeof want === 'function' ? !!want(actual) : String(actual) === String(want);
    S.checks.push({ label, actual: String(actual).slice(0, 600), passed });
    console.log(`${passed ? 'ok  ' : 'FAIL'} ${S.checks.length}. ${label}: ${String(actual).slice(0, 300)}`);
    if (!passed && !process.env.SOFT) { S.save({ stoppedAt: label }); throw new Error(`STOP at "${label}" (want ${typeof want === 'function' ? want.toString().slice(0, 160) : want}). ${S.url()}`); }
    return actual;
  };
  S.retry = async (fn) => {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) {
        if (i < 8 && /block info|ECONNRESET|fetch failed|socket|50[0-9]|busy|409|timeout|terminated/i.test(String(e?.message ?? e))) { await new Promise((r) => setTimeout(r, 5000)); continue; }
        throw e;
      }
    }
  };
  S.step = async (s) => (await S.retry(() => submitSimulationSteps(S.sid, { steps: [s] }))).steps[0];
  S.tenure = async () => { if (++S.ops % 20 === 0) await S.step({ TenureExtend: { cause: 'Extended' } }); };
  S.evRaw = async (cid, code, sender = DEP) => { await S.tenure(); return decode(await S.step({ Eval: [sender, '', cid, code] })); };
  S.ev = async (label, cid, code, want) => S.check(label, await S.evRaw(cid, code), want);
  S.read = async (code, cid = MARKET) => U(await S.evRaw(cid, code));
  S.fixture = async (label, cid, code, want) => { S.fixtures.push(label); return S.ev(`fixture: ${label}`, cid, code, want); };
  S.tx = async (label, sender, cid, fn, args, want) => {
    await S.tenure();
    const r = await S.retry(() => callContract(S.sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0, postConditionMode: PostConditionMode.Allow }));
    const result = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify({ vm: r.vmError, pc: r.pcAborted }).slice(0, 400)}` : r.result;
    S.check(label, result, want);
    return { result, receipt: r.receipt, f: fields(result) };
  };
  S.deploy = async (cname, body, version, sender = DEP, form = 'deploy-bytes-mv7dfb') => {
    const raw = await makeUnsignedContractDeploy({ contractName: cname, codeBody: body, clarityVersion: version, nonce: await getNonce(S.sid, sender), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
    setSender(raw, sender);
    S.sources[`${sender}.${cname}`] = { form, bytes: Buffer.byteLength(body), sha256: sha256(body) };
    S.check(`deploy ${sender.slice(0, 6)}.${cname} (${Buffer.byteLength(body)} B, ${form})`, decode(await S.step({ Transaction: raw.serialize() })), ok);
  };
  S.sendStx = async (label, from, to, amount) => {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: to, amount: BigInt(amount), nonce: await getNonce(S.sid, from), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, from);
    S.check(label, decode(await S.step({ Transaction: raw.serialize() })), '(ok true)');
  };
  S.offset = () => (S.burn - FIRST_BURN) % CYCLE;
  S.cycle = () => Math.floor((S.burn - FIRST_BURN) / CYCLE);
  S.advance = async (n, label, secs = 1) => {
    for (let left = n; left > 0;) {
      const k = Math.min(left, 300);
      const s = await S.step({ AdvanceBlocks: { bitcoin_blocks: k, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: secs } });
      if (!JSON.stringify(s).includes('Ok')) S.check(`advance ${k}`, JSON.stringify(s).slice(0, 300), 'ok');
      left -= k; S.burn += k;
    }
    S.check(`${label}: advanced ${n} burn blocks (burn ${S.burn}, cycle ${S.cycle()}, offset ${S.offset()})`, String(await S.evRaw(POX, 'burn-block-height')), `u${S.burn}`);
  };
  S.fresh = async () => {
    const stamp = Number(U(await S.evRaw(POX, 'stacks-block-time')));
    for (let i = 0; i < 40; i++) {
      const p = await fetchLazerUpdateAny();
      if ((await lazerFeedTimes(p.hex)).at > stamp) { S.lz = p; S.UPD = Cl.buffer(Buffer.from(p.hex.replace(/^0x/, ''), 'hex')); S.MID = (p.px * PP) / p.py; return S.UPD; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('no signed print newer than the fork clock');
  };
  S.events = (r) => (r.receipt?.events ?? []).map((e) => (typeof e === 'string' ? JSON.parse(e) : e)).filter((e) => e.committed !== false);
  S.printsOf = (r, contract) => S.events(r).filter((e) => e.contract_event && e.contract_event.contract_identifier === contract).map((e) => cvToString(deserializeCV(e.contract_event.raw_value)));
  S.stxTransfers = (r) => S.events(r).map((e) => e.stx_transfer_event).filter(Boolean).map((t) => ({ ...t, amount: BigInt(t.amount) }));
  // fork DEPLOY_SET_LAG_SECS (default 5400) before now, unless MV7DFB_FORK_BLOCK pins it
  S.start = async (first) => {
    let fork = process.env.MV7DFB_FORK_BLOCK ? Number(process.env.MV7DFB_FORK_BLOCK) : null;
    if (!fork) {
      const get = async (p) => (await fetch(`${NODE}${p}`)).json();
      const tip = (await get('/extended/v1/block?limit=1')).results[0];
      const target = Math.floor(Date.now() / 1000) - Number(process.env.DEPLOY_SET_LAG_SECS ?? 5400);
      let lo = tip.height - 20000, hi = tip.height;
      while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); ((await get(`/extended/v2/blocks/${m}`)).block_time <= target) ? lo = m : hi = m; }
      fork = lo;
    }
    const info = await (await fetch(`${NODE}/extended/v2/blocks/${fork}`)).json();
    S.burn = info.burn_block_height; S.fork = fork;
    console.log(`${name}: fork block ${fork}, burn ${S.burn} (cycle ${S.cycle()}, offset ${S.offset()})`);
    const b = SimulationBuilder.new({ stacksNodeAPI: NODE }).useBlockHeight(fork);
    b.withSender(first.sender ?? DEP).addContractDeploy({ contract_name: first.name, source_code: first.body, clarity_version: first.version });
    S.sid = await S.retry(() => b.run());
    console.log(`View: ${S.url()}`);
    S.sources[`${first.sender ?? DEP}.${first.name}`] = { form: 'deploy-bytes-mv7dfb', bytes: Buffer.byteLength(first.body), sha256: sha256(first.body) };
    const steps = (await S.retry(() => getSimulationResult(S.sid))).steps;
    S.check(`deploy ${first.name}`, decode(steps.find((s) => s.Result?.Transaction)?.Result), ok);
  };
  // Jing core + ladder + market (verified, initialized) + router from the deploy bytes.
  S.jing = async ({ init = true } = {}) => {
    await S.start({ name: 'jing-core-v6', body: bytes('jing-core-v6'), version: ClarityVersion.Clarity5 });
    await S.deploy('jing-ladder-v1', bytes('jing-ladder-v1'), ClarityVersion.Clarity5);
    await S.deploy('markets-sbtc-stx-jing-v6-3', bytes('markets-sbtc-stx-jing-v6-3'), ClarityVersion.Clarity5);
    if (init) {
      await S.tx('market sync-seat-count', DEP, MARKET, 'sync-seat-count', [], '(ok u10)');
      await S.tx('core-v6 verifies the market', DEP, CORE, 'set-verified-contract', [cp(MARKET)], '(ok true)');
      await S.tx('market initialize', DEP, MARKET, 'initialize', [cp(MARKET), cp(SBTC), cp(WSTX), Cl.uint(1000), Cl.uint(1_000_000), Cl.uint(1), Cl.uint(45)], '(ok true)');
    }
    await S.deploy('swap-router-sbtc-stx-jing-v5-3', bytes('swap-router-sbtc-stx-jing-v5-3'), ClarityVersion.Clarity5);
  };
  S.grant = async (signer, authId) => {
    const priv = randomPrivateKey(), key = privateKeyToPublic(priv);
    const [a, n] = POX.split('.');
    const r = await (await fetch(`${NODE}/v2/contracts/call-read/${a}/${n}/get-signer-grant-message-hash`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sender: DEP, arguments: [cp(signer), Cl.uint(authId)].map((c) => '0x' + serializeCV(c).replace(/^0x/, '')) }) })).json();
    const sig = signMessageHashRsv({ messageHash: r.result.replace(/^0x/, '').slice(2 + 8), privateKey: priv });
    return [cp(signer), Cl.buffer(Buffer.from(key.replace(/^0x/, ''), 'hex')), Cl.uint(authId), Cl.buffer(Buffer.from(sig.replace(/^0x/, ''), 'hex'))];
  };
  // a real STX maker bid on the v6-3 book (2 x the sats' value, limit mid + 5%)
  S.stxBid = async (sats, tag, who = STX_WHALE) => {
    await S.fresh();
    const amount = (sats * S.MID) / 10_000_000_000n * 2n;
    await S.tx(`${tag}: real STX maker bid (${amount} uSTX)`, who, MARKET, 'deposit-token-y', [Cl.uint(amount), Cl.uint((S.MID * 105n) / 100n), Cl.none(), cp(WSTX), Cl.stringAscii('wstx')], `(ok u${amount})`);
    if ((await S.evRaw(MARKET, `(get-token-y-pending-deposit '${who})`)) !== 'none')
      await S.tx(`${tag}: settle the pending bid`, who, MARKET, 'settle-token-y-deposit', [P(who), await S.fresh(), cp(WSTX), Cl.stringAscii('wstx')], ok);
  };
  S.cancelBid = async (tag, who = STX_WHALE) => {
    if (U(await S.evRaw(MARKET, `(get-token-y-deposit (get-current-cycle) '${who})`)) > 0n)
      await S.tx(`${tag}: bidder cancels the rest`, who, MARKET, 'cancel-token-y-deposit', [cp(WSTX), Cl.stringAscii('wstx')], ok);
  };
  S.done = () => {
    S.save({ fork: S.fork });
    const failed = S.checks.filter((c) => !c.passed);
    console.log(`\n=== ${name}: ${S.checks.length - failed.length}/${S.checks.length} checks green ===\n${S.url()}`);
    for (const c of failed) console.log(`FAILED: ${c.label}: ${c.actual.slice(0, 300)}`);
    if (failed.length) process.exitCode = 1;
  };
  return S;
}
