import assert from 'node:assert/strict';
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, cvToString } from '@stacks/transactions';

const RUNG_KEYS = ['1', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
const U = Cl.uint;

export async function createRuntime(side) {
  const raw = await initSimnet(`tests/rv/mm-loop-sell/${side}/Clarinet.toml`);
  const owner = raw.deployer;
  const harnessName = `rv-${side}`;
  const harness = `${owner}.${harnessName}`;
  const vault = `${owner}.vault`;
  const keeperAgent = `${owner}.keeper-agent`;
  const accounts = [...raw.getAccounts()].filter(([name]) => name !== 'faucet').map(([, principal]) => principal);
  const p = name => Cl.contractPrincipal(owner, name);
  const setupCall = (contract, fn, args, sender = owner) => {
    const receipt = raw.callPublicFn(contract, fn, args, sender);
    assert.equal(receipt.result.type, 'ok', `setup ${contract}.${fn}: ${cvToString(receipt.result)}`);
    return receipt;
  };
  for (const account of accounts) setupCall('token', 'mint', [U(10n ** 18n), Cl.principal(account)]);
  for (const name of ['vault', 'market', ...RUNG_KEYS.map(n => `rung-${n}`)]) {
    setupCall('token', 'mint', [U(10n ** 15n), p(name)]);
  }
  assert.equal(raw.transferSTX(10n ** 13n, vault, owner).result.type, 'ok');
  assert.equal(raw.transferSTX(10n ** 13n, `${owner}.market`, owner).result.type, 'ok');
  for (const n of RUNG_KEYS) assert.equal(raw.transferSTX(10n ** 11n, `${owner}.rung-${n}`, owner).result.type, 'ok');

  setupCall(harnessName, 'update-context', [Cl.stringAscii('setup'), U(0)]);

  const trace = [];
  const stats = { publicCalls: 0, action: {} };
  const sim = new Proxy(raw, {
    get(target, key) {
      if (key === 'callPublicFn') return (contract, fn, args, sender) => {
        const receipt = target.callPublicFn(contract, fn, args, sender);
        stats.publicCalls++;
        if (contract === harnessName || contract === harness || contract.endsWith(`.${harnessName}`)) {
          trace.push({ fn, args: args.map(cvToString), sender, result: cvToString(receipt.result) });
          stats.action[fn] = (stats.action[fn] ?? 0) + 1;
        }
        return receipt;
      };
      if (key === 'mineEmptyBurnBlocks') return blocks => {
        trace.push({ mineEmptyBurnBlocks: blocks });
        return target.mineEmptyBurnBlocks(blocks);
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { sim, raw, owner, harness, harnessName, vault, keeperAgent, accounts, trace, stats };
}
