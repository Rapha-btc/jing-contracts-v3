// Read-only release gate. Never calls setters or handles signing credentials.
import { writeFileSync, mkdirSync } from 'node:fs';
import { principalCV, serializeCV, deserializeCV, cvToString } from '@stacks/transactions';
const d = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const api = process.env.STACKS_NODE || 'https://api.mainnet.hiro.so';
const targets = ['pepe-smart-faktory','welsh-smart-faktory','b-smart-faktory','mia-smart-faktory','leo-smart-faktory','flatearth-smart-faktory','fakfun-smart-faktory','lwb-smart-faktory','rock-smart-faktory-2'];
const results = [];
for (const [contract, fn, arg] of [...targets.map(n => ['jing-btc-in-adapter-v3', 'is-approved-target', `${d}.${n}`]), ['jing-btc-in-escrow-v6', 'is-keeper', d]]) {
  const response = await fetch(`${api}/v2/contracts/call-read/${d}/${contract}/${fn}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sender:d,arguments:[serializeCV(principalCV(arg))]}),signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`read ${contract}.${fn}: HTTP ${response.status}`);
  const data = await response.json();
  if (!data.okay || !data.result) throw new Error(`read ${contract}.${fn}: ${JSON.stringify(data)}`);
  const value = cvToString(deserializeCV(data.result));
  results.push({contract,fn,arg,value});
  console.log(`${value === 'true' ? 'PASS' : 'BLOCKED'} ${contract}.${fn} ${arg}: ${value}`);
}
const ready = results.every(r => r.value === 'true');
mkdirSync('simulations/results',{recursive:true});
writeFileSync('simulations/results/btc-in-v3-init.json', JSON.stringify({checkedAt:new Date().toISOString(),api,ready,results},null,2)+'\n');
if (!ready) process.exitCode = 1;
