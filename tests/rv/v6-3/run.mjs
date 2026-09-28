// Seeded full RV suite; inspect reports because RV may exit 0 on failure.
import fs from 'node:fs';
import {hashInputs, assertInputsUnchanged, assertProductionPrefix, sharedInputs} from './source-integrity.mjs';
import { spawnSync } from 'node:child_process';
const dir='simulations/results/rv-v6-3';fs.mkdirSync(dir,{recursive:true});
const jobs=[
 {mode:'invariant',runs:1000,seed:230927},
 {mode:'test',runs:5000,seed:230926},
 {mode:'seeded',runs:3000,seed:230929},
];
const evidencePath=`${dir}/run-inputs.json`;
let evidence;
if(!process.argv.includes('--summarize')) {
 fs.rmSync(evidencePath,{force:true});
 const b=spawnSync('python3',['tests/rv/v6-3/build.py'],{stdio:'inherit'});
 if(b.error||b.status!==0)throw b.error??Error(`RV build exit ${b.status}`);
 assertProductionPrefix(false);
 evidence={hashes:hashInputs([...sharedInputs,'tests/rv/v6-3/run.mjs','tests/rv/v6-3/run-seeded.mjs']),logs:{}};
 for(const j of jobs){
  assertInputsUnchanged(evidence.hashes);
  console.log(`RV ${j.mode}, runs=${j.runs}, seed=${j.seed}`);
  const path=`${dir}/${j.mode}-${j.seed}.log`,fd=fs.openSync(path,'w');
  const cmd=j.mode==='seeded'?process.execPath:'node_modules/.bin/rv';
  const args=j.mode==='seeded'?['tests/rv/v6-3/run-seeded.mjs','test',String(j.runs),String(j.seed)]:['tests/rv/v6-3','market',j.mode,`--runs=${j.runs}`,`--seed=${j.seed}`,'--bail'];
  const r=spawnSync(cmd,args,{stdio:['ignore',fd,fd]});fs.closeSync(fd);
  if(r.error||r.status!==0)throw r.error??Error(`RV exit ${r.status}: ${path}`);
  assertInputsUnchanged(evidence.hashes);
  Object.assign(evidence.logs,hashInputs([path]));
 }
 fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
}else{
 evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
}
assertInputsUnchanged(evidence.hashes);
assertInputsUnchanged(evidence.logs);
const results=jobs.map(j=>{
 const path=`${dir}/${j.mode}-${j.seed}.log`,s=fs.readFileSync(path,'utf8').replace(/\x1b\[[0-9;]*m/g,'');
 const passed=(s.match(/\[PASS\]/g)||[]).length,discarded=(s.match(/\[WARN\]/g)||[]).length;
 const failed=(s.match(/\[FAIL\]/g)||[]).length;
 if(failed||passed+discarded!==j.runs||!s.includes('EXECUTION STATISTICS')||/ArithmeticUnderflow|ArithmeticOverflow|DivisionByZero|\(err u990[01]\)/.test(s))throw Error(`Failed/incomplete RV report: ${path}`);
 const unexpected=[...s.matchAll(/^Error: (.+)$/gm)].map(m=>m[1]).filter(x=>!x.startsWith('Runtime error while interpreting ')&&!x.startsWith('BadTokenName('));
 if(unexpected.length)throw Error(`Unexpected runtime errors in ${path}: ${unexpected.join('; ')}`);
 const counts={};for(const m of s.matchAll(/rv-success: "([^"]+)"/g))counts[m[1]]=(counts[m[1]]??0)+1;
 const refunds={};for(const m of s.matchAll(/reason: "([^"]*)"/g))refunds[m[1]||'placed']=(refunds[m[1]||'placed']??0)+1;
 return {...j,passed,discarded,failed,actualSuccessfulWrapperCalls:counts,settleOutcomes:refunds,invalidAssetRuntimeErrors:(s.match(/Error: BadTokenName\(/g)||[]).length,log:path};
});
assertProductionPrefix(false);
assertInputsUnchanged(evidence.hashes);
const hashes=evidence.hashes;
fs.writeFileSync('tests/rv/v6-3/results.json',JSON.stringify({generatedAt:new Date().toISOString(),hashes,results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
