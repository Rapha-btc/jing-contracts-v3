import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import './build.mjs';
import { Cl, cvToString } from '@stacks/transactions';
import { createRuntime } from './runtime.mjs';

const require = createRequire(import.meta.url);
const { checkProperties } = require('../../../node_modules/@stacks/rendezvous/dist/property.js');
const { checkInvariants } = require('../../../node_modules/@stacks/rendezvous/dist/invariant.js');
const { getSimnetDeployerContractsInterfaces, getFunctionsFromContractInterfaces } = require('../../../node_modules/@stacks/rendezvous/dist/shared.js');

async function runOne(side, mode, runs, seed) {
  let runtime = await createRuntime(side);
  const label = `${side}-${mode}-${seed}`;
  const radio = new EventEmitter();
  const radioLog = [];
  let failed = false;
  let counterexampleWritten = false;
  for (const name of ['logMessage', 'logInfo', 'logFailure']) radio.on(name, message => {
    radioLog.push({ name, message });
    if (/\[FAIL\]|ArithmeticUnderflow|ArithmeticOverflow|DivisionByZero/.test(message)) failed = true;
    if (/\[FAIL\]|OK, (?:invariants|property)|Starting fresh|Property failed|RV COUNTEREXAMPLE/.test(message)) console.log(message);
  });
  const simnet = new Proxy({}, { get(_object, key) {
    const value = Reflect.get(runtime.sim, key);
    return typeof value === 'function' ? value.bind(runtime.sim) : value;
  } });
  const reset = async () => { runtime = await createRuntime(side); };
  const target = `${runtime.owner}.rv-${side}`;
  const interfaces = getSimnetDeployerContractsInterfaces(runtime.sim);
  const functions = getFunctionsFromContractInterfaces(new Map([...interfaces].filter(([id]) => id === target)));
  const actions = functions.get(target) ?? [];
  functions.set(target, actions.filter(({ name }) => name !== 'test-donate-proceeds' && name !== 'rv-test-donate-proceeds'));
  const eligible = new Map([...runtime.sim.getAccounts()].filter(([name]) => name !== 'faucet').sort(([a], [b]) => a.localeCompare(b)));
  const addresses = [...eligible.values()];
  console.log(`RV MM-LOOP-SELL side=${side} mode=${mode} runs=${runs} seed=${seed}`);
  try {
    if (mode === 'test') await checkProperties(simnet, reset, [target], functions, seed, runs, true, false, radio, eligible, addresses);
    else await checkInvariants(simnet, reset, [target], functions, seed, runs, undefined, false, false, radio, eligible, addresses);
  } catch (error) {
    failed = true;
    const path = `tests/rv/mm-loop-sell/.build/${label}.counterexample.json`;
    fs.mkdirSync('tests/rv/mm-loop-sell/.build', { recursive: true });
    fs.writeFileSync(path, JSON.stringify({ side, mode, seed, runs, error: String(error), trace: runtime.trace, radioLog }, null, 2) + '\n');
    counterexampleWritten = true;
    console.error(`RV COUNTEREXAMPLE ${path}`);
    console.error(String(error));
  }
  const status = cvToString(runtime.sim.callReadOnlyFn(`rv-${side}`, 'rv-status', [], runtime.owner).result);
  const totalSats = cvToString(runtime.sim.callReadOnlyFn(`rv-${side}`, 'rv-sats-total', [], runtime.owner).result);
  console.log(`RV STATUS ${status}`);
  console.log(`RV SATS-TOTAL ${totalSats}`);
  console.log(`RV CALLS ${JSON.stringify(runtime.stats)}`);
  fs.mkdirSync('tests/rv/mm-loop-sell/.build', { recursive: true });
  fs.writeFileSync(`tests/rv/mm-loop-sell/.build/${label}.log`, radioLog.map(entry => entry.message).join('\n') + '\n');
  const statusInvalid = !status.includes('(valid true)') || !status.includes('(withdraw-valid true)') || !status.includes('(booking-valid true)');
  if (statusInvalid) failed = true;
  if (failed && !counterexampleWritten) {
    const path = `tests/rv/mm-loop-sell/.build/${label}.counterexample.json`;
    fs.writeFileSync(path, JSON.stringify({ side, mode, seed, runs, status, trace: runtime.trace, radioLog }, null, 2) + '\n');
    console.error(`RV COUNTEREXAMPLE ${path}`);
  }
  if (failed || statusInvalid) process.exitCode = 1;
}

const [sideArg = 'both', modeArg = 'both', runsArg = '500', seedArg = '261021'] = process.argv.slice(2);
const sides = sideArg === 'both' ? ['sbtc', 'stx'] : [sideArg];
const modes = modeArg === 'both' ? ['invariant', 'test'] : [modeArg];
if (sides.some(side => !['sbtc', 'stx'].includes(side))) throw Error(`bad side ${sideArg}`);
if (modes.some(mode => !['invariant', 'test'].includes(mode))) throw Error(`bad mode ${modeArg}`);
for (let sideIndex = 0; sideIndex < sides.length; sideIndex++) {
  for (let modeIndex = 0; modeIndex < modes.length; modeIndex++) {
    const index = sideIndex * modes.length + modeIndex;
    await runOne(sides[sideIndex], modes[modeIndex], Number(runsArg), Number(seedArg) + index);
  }
}
