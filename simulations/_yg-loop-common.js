// _yg-loop-common.js - shared stxer plumbing for
// verify-yguazu-mm-loop-sell-sbtc.js and verify-yguazu-mm-loop-sell-stx.js.
// Soft checks: a failing check is recorded and the run continues; `must`
// stops the run (setup steps the rest depends on).
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV,
  noneCV, deserializeCV, cvToString, getAddressFromPrivateKey,
  makeUnsignedSTXTokenTransfer, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

export const NODE = process.env.STACKS_NODE || 'http://77.42.3.101/stacks-api';
export const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
export const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-4`;
export const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
export const WSTX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
export const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
export const BANDS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90];
export const BPS = 10000n, EDGE = 25n, SCALE = 10n ** 10n;
export const P_ = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
export const T = { x: P_(SBTC), y: P_(WSTX) };
export const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
export const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');

export class Stop extends Error {}
export function plain(c) {
  switch (c.type) {
    case 'uint': case 'int': return BigInt(c.value);
    case 'true': return true; case 'false': return false;
    case 'none': return null; case 'some': return plain(c.value);
    case 'ok': return { ok: plain(c.value) }; case 'err': return { err: plain(c.value) };
    case 'tuple': return Object.fromEntries(Object.entries(c.value).map(([k, v]) => [k, plain(v)]));
    case 'list': return c.value.map(plain);
    default: return c.value;
  }
}
export const show = (v) => JSON.stringify(v, (k, x) => typeof x === 'bigint' ? `u${x}` : x);

export const S = { sid: null, passed: 0, checks: 0, group: '', groups: {}, notes: [], fails: [], UPD: null, MID: 0n };
export function setGroup(g) { S.group = g; console.log(`\n=== ${g} ===`); }
export function check(label, ok, detail = '') {
  S.checks++; S.groups[S.group] ??= [0, 0]; S.groups[S.group][1]++;
  if (ok) { S.passed++; S.groups[S.group][0]++; } else S.fails.push(`${S.checks}. [${S.group}] ${label}: ${String(detail).slice(0, 400)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${S.checks}. ${label}${detail ? `: ${String(detail).slice(0, 600)}` : ''}`);
  return ok;
}
export function must(label, ok, detail = '') {
  if (!check(label, ok, detail)) throw new Stop(`STOP at check ${S.checks} (${label})`);
}
export const note = (s) => { S.notes.push(s); console.log(`  note: ${s}`); };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message ?? e);
      if (i < 8 && /ECONNRESET|fetch failed|socket hang|timed? ?out|\b(502|503|504|520|522|524|429)\b|ETIMEDOUT|EAI_AGAIN/i.test(m)) { await sleep(5000 * (i + 1)); continue; }
      throw e;
    }
  }
}
export async function startSim(probeCid) {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(probeCid, '(get-state)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);
}
export async function evalIn(cid, code) {
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ TenureExtend: { cause: 'Extended' } }, { Eval: [DEP, '', cid, code] }] }));
  const r = out.steps[1];
  if (!r?.Eval || !('Ok' in r.Eval)) throw new Error(`eval failed in ${cid}: ${JSON.stringify(r).slice(0, 300)} :: ${code.slice(0, 200)}`);
  return plain(deserializeCV(r.Eval.Ok));
}
// raw call: never throws on a VM error; returns { res, receipt, vm }
export async function call(sender, cid, fn, args) {
  await retry(() => submitSimulationSteps(S.sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] }));
  const r = await retry(() => callContract(S.sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  let res = null;
  try { res = r.resultHex ? plain(deserializeCV(r.resultHex)) : null; } catch { res = null; }
  return { res, receipt: r.receipt, vm: r.vmError || r.pcAborted ? { vm: r.vmError, pc: r.pcAborted } : null };
}
export async function tx(label, sender, cid, fn, args, want) {
  const r = await call(sender, cid, fn, args);
  const ok = !r.vm && (typeof want === 'function' ? want(r.res) : show(r.res) === show(want));
  check(label, ok, r.vm ? `VM ${show(r.vm)}` : show(r.res));
  return r;
}
export const E = (n) => (v) => v?.err === BigInt(n);
export const OK = (v) => v?.ok !== undefined;
export function prints(receipt) {
  return (receipt?.events ?? []).map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed !== false && e.contract_event)
    .map((e) => { try { return plain(deserializeCV(e.contract_event.raw_value)); } catch { return null; } })
    .filter((p) => p && typeof p.event === 'string');
}
export async function stxTransfer(from, to, amount) {
  const raw = await makeUnsignedSTXTokenTransfer({ recipient: to, amount, nonce: await retry(() => getNonce(S.sid, from)), network: 'mainnet', publicKey: '', fee: 0 });
  setSender(raw, from);
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  must(`fund ${to.slice(0, 10)} with ${amount} uSTX`, t && !t.vm_error && cvToString(deserializeCV(t.result)) === '(ok true)');
}
export async function sbtcTransfer(from, to, amount) {
  const r = await call(from, SBTC, 'transfer', [uintCV(amount), P_(from), P_(to), noneCV()]);
  must(`fund ${to.slice(0, 10)}${to.includes('.') ? '.' + to.split('.')[1] : ''} with ${amount} sats`, !r.vm && r.res?.ok === true, show(r.res ?? r.vm));
}
export async function deploy(sender, name, code) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await retry(() => getNonce(S.sid, sender)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Deny });
  setSender(raw, sender);
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Transaction: raw.serialize() }] }));
  const t = out.steps[0]?.Transaction?.Ok;
  must(`deploy ${name} as ${sender.slice(0, 8)} (Clarity 5)`, t && !t.vm_error && cvToString(deserializeCV(t.result)).startsWith('(ok'), JSON.stringify(out.steps[0]).slice(0, 600));
}
export const sbtcBal = async (who) => (await evalIn(SBTC, `(get-balance '${who})`)).ok;
export const stxBal = async (who) => await evalIn(MARKET, `(stx-get-balance '${who})`);
export const blockTime = async () => Number(await evalIn(MARKET, 'stacks-block-time'));

// A Lazer update strictly newer than the sim's stacks-block-time (settle
// needs at > submitted-at). MID = the market price that update yields.
export async function freshUpd(force = false) {
  const bt = await blockTime();
  if (!force && S.UPD && S.UPD.at > bt && Date.now() - S.UPD.fetched < 20000) return S.UPD;
  for (let i = 0; i < 40; i++) {
    const u = await retry(() => fetchLazerUpdateAny()), t = await retry(() => lazerFeedTimes(u.hex));
    if (t.at > bt) {
      S.UPD = { ...u, at: t.at, fetched: Date.now() };
      S.MID = u.px * 100000000n / u.py;
      console.log(`  lazer update at ${t.at} (block time ${bt}), mid ${S.MID}`);
      return S.UPD;
    }
    await sleep(3000);
  }
  throw new Error('no Lazer update newer than the sim block time');
}
export const updCV = () => bufferCV(Buffer.from(S.UPD.hex.replace(/^0x/, ''), 'hex'));
export const curCycle = async () => await evalIn(MARKET, '(get-current-cycle)');

// every match print from a receipt
export const matches = (receipt) => prints(receipt).filter((p) => p.event === 'match');

export function summary() {
  console.log('\nGroups:'); for (const [g, [p, n]] of Object.entries(S.groups)) console.log(`  ${p === n ? 'PASS' : 'FAIL'} ${g}: ${p}/${n}`);
  for (const n of S.notes) console.log(`  note: ${n}`);
  if (S.fails.length) { console.log('\nFailing checks:'); for (const f of S.fails) console.log(`  ${f}`); }
  console.log(`\n${S.passed}/${S.checks} checks green`);
  console.log(`https://stxer.xyz/simulations/mainnet/${S.sid}`);
}
