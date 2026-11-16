// _v6-3-port-plumbing-sbtc-usdcx.mjs - the shared preamble of
// verify-v6-3-{dispatch,caller-impact,router-impact}.js and
// verify-v6-rungs-escrow-timeout.js (same check / ev / tx / fund / deploy /
// event helpers), ported to the sBTC/USDCx v6-5 set:
//   token y = USDCx (ft transfer from the USDCx whale, get-balance reads),
//   Lazer [1,7], deploy bytes = the hash-checked faktory-dao templates,
//   fork at tip on the LIVE jing-core-v6 / jing-ladder-sbtc-usdcx-v1 /
//   jing-ladder-dispatch-sbtc-usdcx; owner calls by the live owners.
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, deserializeCV, cvToString, getAddressFromPrivateKey,
  makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import {
  DEP, NODE, SBTC, USDCX, SBTC_WHALE, USDC_WHALE, CORE, LADDER, DISPATCH, NAMES, MARKET,
  bytes, printHashes, fetchUsdcxUpdate, usdcxFeedTimes,
} from './_sbtc-usdcx-v6-5-common.mjs';

export { DEP, NODE, SBTC, USDCX, CORE, LADDER, DISPATCH, NAMES, MARKET, bytes };
export const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
export const traits = { x: principal(SBTC), y: principal(USDCX) };
export const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('usdcx-token') };
export const WHALES = { x: SBTC_WHALE, y: USDC_WHALE };
export const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
export const keeper = mk(871);
export const cv = (hex) => cvToString(deserializeCV(hex));
export const decode = (step) => {
  const r = step?.Result;
  if (r?.Eval?.Ok) return cv(r.Eval.Ok);
  if (r?.Transaction?.Ok) {
    const t = r.Transaction.Ok;
    if (t.vm_error || t.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(t)}`;
    return cv(t.result);
  }
  return `ENGINE-ERR ${JSON.stringify(r)}`;
};
export const ok = (v) => v.startsWith('(ok');
export const update = (u) => bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
export const S = { passed: 0, checks: 0, failures: 0, sid: null, stopOnFail: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const m = String(e?.message ?? e);
      if (i < 8 && /ECONNRESET|fetch failed|socket hang|timed? ?out|\b(502|503|504|520|522|524|429)\b|ETIMEDOUT|EAI_AGAIN/i.test(m)) { await sleep(5000 * (i + 1)); continue; }
      throw e;
    }
  }
}
export function check(label, actual, want) {
  S.checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) S.passed++; else S.failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${S.checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${want}`}`);
  if (!good && S.stopOnFail) finishPhase();
  return good;
}
export function finishPhase() {
  if (S.failures) { console.log(`${S.passed}/${S.checks} checks green`); throw new Error(`Fork checks failed: https://stxer.xyz/simulations/mainnet/${S.sid}`); }
}
export async function ev(label, cid, code, want) {
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Eval: [DEP, '', cid, code] }] }));
  const actual = decode({ Result: out.steps[0] });
  check(label, actual, want);
  return actual;
}
// eval without counting a check (setup reads)
export async function read(cid, code) {
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Eval: [DEP, '', cid, code] }] }));
  return decode({ Result: out.steps[0] });
}
export async function tx(label, sender, cid, fn, args, want) {
  const r = await retry(() => callContract(S.sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 }));
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return r;
}
export const balance = (side, p) => side === 'y' ? `(unwrap-panic (contract-call? '${USDCX} get-balance '${p}))` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
export const pending = (side, p) => `(get-token-${side}-pending-deposit '${p})`;
export const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
export const parked = (side, p) => `(get-token-${side}-parked '${p})`;
export const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), traits[side], assets[side]];
export const settleArgs = (side, who, u) => [principal(who), update(u), traits[side], assets[side]];
export const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];
export async function freshAfter(stamp) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const u = await retry(fetchUsdcxUpdate);
    const times = await retry(() => usdcxFeedTimes(u.hex));
    if (times.at > stamp) return u;
    await sleep(2000);
  }
  throw new Error(`No newer signed [1,7] feed after ${stamp}`);
}
export function event(label, receipt, side, name, fields = {}) {
  const prints = receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
    .map((e) => cv(e.contract_event.raw_value));
  check(label, prints.join(' | '), () => prints.some((value) => value.includes(`(event "${name}${side ? `-${side}` : ''}")`) &&
    Object.entries(fields).every(([key, val]) => value.includes(`(${key} ${val})`))));
}
export async function fund(side, who, amount) {
  if (side === 'x') await tx('fund fresh sBTC', WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(who), noneCV()], '(ok true)');
  else await tx('fund fresh USDCx', WHALES.y, USDCX, 'transfer', [uintCV(amount), principal(WHALES.y), principal(who), noneCV()], '(ok true)');
  finishPhase();
}
export async function deployCode(name, code, sender = DEP) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await retry(() => getNonce(S.sid, sender)), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, sender);
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ Transaction: raw.serialize() }] }));
  check(`deploy ${name}`, decode({ Result: out.steps[0] }), ok); finishPhase();
}
// rung deploy: x side = jing-sell-sbtc-<bps>-v2, y side = jing-buy-sbtc-<bps>-v2
export const rungName = (side, bps) => `jing-${side === 'x' ? 'sell' : 'buy'}-sbtc-${bps}-v2`;
export const rungBytes = (side) => bytes(side === 'x' ? 'sell' : 'buy');
export const bandSide = (side) => side === 'x' ? 'sel-band' : 'buy-band';
export const heldField = (side) => side === 'x' ? 'held-sats' : 'held-uusdcx';

// markets-sbtc-usdcx-jing-v6-5 went live at 9504103 (deployed bytes = the
// template, SHA-256 3290d26a...): the fork is pinned one block earlier so the
// set's names are still free. USDCX_PIN=<h> overrides, USDCX_PIN=tip unpins.
// Signed Lazer prints are newer than the pinned block's time; the market
// accepts prints ahead of the block (age 0).
export const PIN = process.env.USDCX_PIN ?? '9504102';
// New sim at the pin (or `height`), read live owners.
export async function startSim(height) {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const h = height ?? (PIN === 'tip' ? null : Number(PIN));
  if (h) { b.useBlockHeight(h); console.log(`  fork pinned at ${h}`); }
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);
  const strip = (v) => v.replace(/^'/, '');
  const owners = { core: strip(await read(CORE, '(get-contract-owner)')), ladder: strip(await read(LADDER, '(get-owner)')) };
  console.log(`  live owners: core ${owners.core}, ladder ${owners.ladder}`);
  return owners;
}
// deploy a market from `code` under `name`, verify in the live core,
// initialize (min 1000 sats / 1 USDCx, feeds 1/7) through the core owner,
// hand the operator back to DEP.
export async function deployMarket(owners, name = NAMES.market, code = bytes('market'), { sync, syncWant = '(ok u10)' } = {}) {
  const m = `${DEP}.${name}`;
  await deployCode(name, code);
  if (sync) await tx('sync seats', DEP, m, 'sync-seat-count', [], syncWant);
  await tx('verify market (live core owner)', owners.core, CORE, 'set-verified-contract', [principal(m)], '(ok true)');
  await tx('market operator -> core owner', DEP, m, 'set-operator', [principal(owners.core)], '(ok true)');
  await tx('initialize market (sbtc, usdcx, 1000, 1000000, 1, 7)', owners.core, m, 'initialize', [principal(m), traits.x, traits.y, uintCV(1000), uintCV(1000000), uintCV(1), uintCV(7)], '(ok true)');
  await tx('market operator -> DEP', owners.core, m, 'set-operator', [principal(DEP)], '(ok true)');
  return m;
}
export { printHashes, retry, sleep, stringAsciiCV };
