// Replay a monitor counterexample (tests/rv/.build/results/ladder-v1/
// counterexample-*.json) call by call in a fresh runtime, with the current
// monitor, and report the first call after which a check fails.
//   node tests/rv/ladder-v1/replay.mjs <counterexample.json> [--no-throw]
import fs from 'node:fs';
import { Cl, cvToString } from '@stacks/transactions';
import { createRuntime } from './runtime.mjs';
const ce = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const parse = a => a.startsWith('"') ? Cl.stringAscii(JSON.parse(a)) : /^u\d+$/.test(a) ? Cl.uint(BigInt(a.slice(1))) : a === 'true' ? Cl.bool(true) : a === 'false' ? Cl.bool(false)
  : a.startsWith("'") ? Cl.principal(a.slice(1)) : (() => { throw Error(`arg ${a}`); })();
const rt = await createRuntime({ prelude: false, label: 'replay' });
let i = 0;
try {
  for (const t of ce.trace) {
    if (t.burn !== undefined) { rt.sim.mineEmptyBurnBlocks(t.burn); continue; }
    const r = rt.sim.callPublicFn('rv-ladder-harness', t.fn, t.args.map(parse), t.sender);
    i++;
    if (cvToString(r.result) !== t.result) console.log(`#${i} ${t.fn}: result differs (${cvToString(r.result)} vs ${t.result})`);
  }
  const c = rt.monitor.crossCheck();
  console.log(`replayed ${i} calls; final crossCheck: ${c.length ? c.join('; ') : 'clean'}`);
  console.log(JSON.stringify(rt.monitor.stats));
} catch (e) {
  console.log(`FAILED at call #${i + 1} ${ce.trace[i]?.fn} ${ce.trace[i]?.args.join(' ')} by ${ce.trace[i]?.sender}: ${e.message}`);
}
