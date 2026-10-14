// Simnet for the ladder-v1 RV stack. Every setup step is a public call of the
// production contracts (core verification, market initialize, ladder
// canonical + rung initialize with a seat); funding is the strict token's
// owner-only mint. A prelude then gives every rung members, resting orders,
// pending escrow and an opposite book, so the first RV trial starts deep.
import assert from 'node:assert/strict';
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, cvToString } from '@stacks/transactions';
import fs from 'node:fs';
import { ACCOUNTS, RUNGS } from './harness.mjs';
import { createMonitor } from './monitor.mjs';

const MID = 32000000000000n;
const RESULTS = process.env.RV_LOG_DIR ?? 'tests/rv/.build/results/ladder-v1';
const CROSS_EVERY = Number(process.env.RV_CROSS_EVERY ?? 100);
export async function createRuntime({ prelude = true, label = 'run' } = {}) {
  const raw = await initSimnet('tests/rv/ladder-v1/Clarinet.toml');
  const owner = raw.deployer;
  const p = n => Cl.contractPrincipal(owner, n);
  const harness = `${owner}.rv-ladder-harness`;
  const stats = { publicCalls: 0, success: {} };
  const ok = (contract, fn, args, who = owner) => {
    const r = raw.callPublicFn(contract, fn, args, who);
    assert.equal(r.result.type, 'ok', `setup ${contract}.${fn}: ${cvToString(r.result)}`);
    return r;
  };
  ok('jing-core-v6', 'set-verified-contract', [p('market')]);
  ok('market', 'initialize', [p('market'), p('token'), p('asset-stx'), Cl.uint(100), Cl.uint(10000), Cl.uint(1), Cl.uint(45)]);
  // the treasury is a contract that never trades, so fees never move a member balance
  ok('market', 'set-treasury', [p('miner-oracle')]);
  ok('miner-oracle', 'set-mid', [Cl.uint(MID)]);
  ok('jing-ladder-v1', 'set-canonical', [Cl.stringAscii('buy-band'), p(RUNGS[0].name)]);
  ok('jing-ladder-v1', 'set-canonical', [Cl.stringAscii('sel-band'), p(RUNGS[2].name)]);
  for (const r of RUNGS) ok(r.name, 'initialize', [Cl.uint(r.spread), Cl.bool(true)]);
  for (const who of [...ACCOUNTS, harness]) ok('token', 'mint', [Cl.uint(1000000000000n), Cl.principal(who)]);
  { const faucet = raw.getAccounts().get('faucet'); assert.equal(raw.transferSTX(10000000000000n, harness, faucet).result.type, 'ok'); }
  for (const r of RUNGS) assert.equal(cvToString(raw.callReadOnlyFn('jing-ladder-v1', r.buy ? 'is-band-x' : 'is-band-y', [p(r.name)], owner).result), 'true');

  // Count every rv-success print of the harness, whichever caller (RV or
  // prelude), and run the accounting monitor after every public call.
  const monitor = createMonitor(raw, owner), trace = [];
  let failure = null;
  const fail = (bad, where) => {
    failure = { label, where, bad, trace: [...trace] };
    fs.mkdirSync(RESULTS, { recursive: true });
    const path = `${RESULTS}/counterexample-${label}-${Date.now()}-${trace.length}.json`;
    fs.writeFileSync(path, JSON.stringify(failure, null, 2) + '\n');
    throw Error(`RV monitor (${where}) failed after ${trace.length} calls: ${bad.join('; ')} [${path}]`);
  };
  const sim = new Proxy(raw, { get(target, key) {
    if (key === 'callPublicFn') return (contract, fn, args, who) => {
      if (failure) throw Error('RV monitor already failed in this session');
      stats.publicCalls++;
      const receipt = target.callPublicFn(contract, fn, args, who);
      trace.push({ fn, args: args.map(cvToString), sender: who, result: cvToString(receipt.result) });
      if (contract === 'rv-ladder-harness' && (fn === 'test-wait' || fn === 'rv-wait')) target.mineEmptyBlocks(1 + Number(BigInt(cvToString(args[0]).slice(1)) % 150n));
      const bad = monitor.check();
      if (bad.length) fail(bad, 'check');
      if (stats.publicCalls % CROSS_EVERY === 0) { const b = monitor.crossCheck(); if (b.length) fail(b, 'crossCheck'); }
      for (const e of receipt.events ?? []) {
        if (e.event !== 'print_event' || e.data.contract_identifier !== harness) continue;
        const k = e.data.value?.value?.['rv-success']?.value;
        if (k) stats.success[k] = (stats.success[k] ?? 0) + 1;
      }
      return receipt;
    };
    // RV advances heights between calls: record it so a trace replays exactly
    if (key === 'mineEmptyBurnBlocks') return n => { trace.push({ burn: n }); return target.mineEmptyBurnBlocks(n); };
    const v = Reflect.get(target, key); return typeof v === 'function' ? v.bind(target) : v;
  } });
  if (prelude) {
    const call = (fn, args, who) => {
      const r = sim.callPublicFn('rv-ladder-harness', fn, args, who);
      assert.equal(cvToString(r.result), '(ok true)', `prelude ${fn}: ${cvToString(r.result)}`);
    };
    const U = Cl.uint, B = Cl.bool;
    // members on every rung (two accounts each), then admit any pending escrow
    for (let k = 0; k < 4; k++) for (const j of [1, 2]) call('test-deposit', [U(k), U(5000 + 1000 * j + 97 * k)], ACCOUNTS[j + k]);
    raw.mineEmptyBlocks(1);
    for (let k = 0; k < 4; k++) {
      const pending = raw.callReadOnlyFn('market', `get-token-${RUNGS[k].buy ? 'x' : 'y'}-pending-deposit`, [p(RUNGS[k].name)], owner).result;
      if (cvToString(pending) !== 'none') call('test-admit', [U(9 + k), B(RUNGS[k].buy)], ACCOUNTS[8]);
    }
    // the dispatcher's own member on both sides
    call('test-batch-deposit', [B(true), U(12345), U(777), U(2)], ACCOUNTS[0]);
    call('test-batch-deposit', [B(false), U(123456789), U(777777), U(2)], ACCOUNTS[0]);
  }
  { const b = monitor.check(); if (b.length) fail(b, 'check'); const c = monitor.crossCheck(); if (c.length) fail(c, 'crossCheck'); }
  return { sim, owner, harness, stats, monitor, final() {
    if (process.env.RV_DUMP_TRACE) fs.writeFileSync(process.env.RV_DUMP_TRACE, JSON.stringify({ label, trace }, null, 1));
    const c = monitor.crossCheck(); if (c.length) fail(c, 'final crossCheck'); return monitor.stats; } };
}
