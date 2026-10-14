// Simnet for the router RV stack: public-call setup of the real core and
// market, funded venue fixtures priced at the Lazer mid, and a two-sided
// Jing book so the book leg can fill from the first trial.
import assert from 'node:assert/strict';
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, cvToString } from '@stacks/transactions';
import { VENUES } from './harness.mjs';
import { ACCOUNTS } from '../ladder-v1/harness.mjs';

const MID = 32000000000000n, SCALE = 10000000000n;
export async function createRuntime() {
  const raw = await initSimnet('tests/rv/router-v5-3/Clarinet.toml');
  const owner = raw.deployer, p = n => Cl.contractPrincipal(owner, n), U = Cl.uint;
  const harness = `${owner}.rv-router-harness`;
  // deployer, wallet_1..wallet_8 in that order; [0..4] are the book makers (RV-MAKERS)
  const accounts = ACCOUNTS;
  const faucet = raw.getAccounts().get('faucet');
  const ok = (c, fn, args, who = owner) => { const r = raw.callPublicFn(c, fn, args, who); assert.equal(r.result.type, 'ok', `setup ${c}.${fn}: ${cvToString(r.result)}`); return r; };
  ok('jing-core-v6', 'set-verified-contract', [p('market')]);
  ok('market', 'initialize', [p('market'), p('token'), p('asset-stx'), U(100), U(10000), U(1), U(45)]);
  ok('market', 'set-treasury', [p('jing-ladder-v1')]);
  for (const who of accounts) ok('token', 'mint', [U(1000000000000n), Cl.principal(who)]);
  // venues: ~1 BTC a side of virtual reserve at the mid (DLMM pools a little
  // off it, so the pick has something to choose), 10x that actually funded
  const shape = { dlmm: [100000000n, 0n], 'dlmm-2': [50000000n, 30n], 'dlmm-3': [20000000n, -40n], xyk: [100000000n, 0n], velar: [70000000n, 10n] };
  for (const v of VENUES) {
    const [sats, bps] = shape[v], ustx = sats * MID * (10000n + BigInt(bps)) / 10000n / SCALE;
    ok(v, 'configure', [U(sats), U(ustx), Cl.bool(false), U(30), U(30)]);
    if (v.startsWith('dlmm')) ok(v, 'configure-dlmm', [Cl.int(0), U(sats * 100000000n / ustx), U(15), U(340282366920938463463374607431768211455n)]);
    ok('token', 'mint', [U(sats * 10n), Cl.principal(`${owner}.${v}`)]);
    assert.equal(raw.transferSTX(ustx * 10n, `${owner}.${v}`, faucet).result.type, 'ok');
  }
  const stats = { publicCalls: 0, success: {} };
  const sim = new Proxy(raw, { get(target, key) {
    if (key === 'callPublicFn') return (contract, fn, args, who) => {
      stats.publicCalls++;
      const receipt = target.callPublicFn(contract, fn, args, who);
      for (const e of receipt.events ?? []) {
        if (e.event !== 'print_event' || e.data.contract_identifier !== harness) continue;
        if (e.data.value?.value?.['rv-violation']) console.log(`RV-VIOLATION ${fn} ${who} args=${args.map(cvToString).join(' ')} ${cvToString(e.data.value)}`);
        const k = e.data.value?.value?.['rv-success']?.value;
        if (k) stats.success[k] = (stats.success[k] ?? 0) + 1;
      }
      return receipt;
    };
    const v = Reflect.get(target, key); return typeof v === 'function' ? v.bind(target) : v;
  } });
  // a two-sided Jing book: x asks just over the mid, y bids just under
  for (let i = 1; i <= 3; i++) {
    const rx = sim.callPublicFn('rv-router-harness', 'test-maker', [Cl.bool(true), U(200000n * BigInt(i)), U(10n * BigInt(i))], accounts[i]);
    assert.equal(cvToString(rx.result), '(ok true)', cvToString(rx.result));
  }
  raw.mineEmptyBlocks(1);
  for (let i = 2; i <= 4; i++) {
    const ry = sim.callPublicFn('rv-router-harness', 'test-maker', [Cl.bool(false), U(600000000n * BigInt(i)), U(10n * BigInt(i))], accounts[i]);
    assert.equal(cvToString(ry.result), '(ok true)', cvToString(ry.result));
  }
  raw.mineEmptyBlocks(1);
  for (let i = 2; i <= 4; i++) {
    const pend = raw.callReadOnlyFn('market', 'get-token-y-pending-deposit', [Cl.principal(accounts[i])], owner).result;
    if (cvToString(pend) !== 'none') assert.equal(cvToString(sim.callPublicFn('rv-router-harness', 'test-admit', [Cl.principal(accounts[i]), Cl.bool(false)], accounts[8]).result), '(ok true)');
  }
  return { sim, owner, harness, stats, monitor: { stats: { checks: 0, crossChecks: 0, positionsCompared: 0 } }, final() { return { maxStranded: {}, maxShareGap: {}, deepest: {} }; } };
}
