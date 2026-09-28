// Seeded full RV suite; inspect reports because RV may exit 0 on failure.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const dir='simulations/results/rv-v6-3';fs.mkdirSync(dir,{recursive:true});
const jobs=[
 {mode:'invariant',runs:1000,seed:230927},
 {mode:'test',runs:5000,seed:230926},
 {mode:'seeded',runs:3000,seed:230929},
];
if(!process.argv.includes('--summarize')) {
 const b=spawnSync('python3',['tests/rv/v6-3/build.py'],{stdio:'inherit'});
 if(b.error||b.status!==0)throw b.error??Error(`RV build exit ${b.status}`);
 for(const j of jobs){
  console.log(`RV ${j.mode}, runs=${j.runs}, seed=${j.seed}`);
  const path=`${dir}/${j.mode}-${j.seed}.log`,fd=fs.openSync(path,'w');
  const cmd=j.mode==='seeded'?process.execPath:'node_modules/.bin/rv';
  const args=j.mode==='seeded'?['tests/rv/v6-3/run-seeded.mjs','test',String(j.runs),String(j.seed)]:['tests/rv/v6-3','market',j.mode,`--runs=${j.runs}`,`--seed=${j.seed}`,'--bail'];
  const r=spawnSync(cmd,args,{stdio:['ignore',fd,fd]});fs.closeSync(fd);
  if(r.error||r.status!==0)throw r.error??Error(`RV exit ${r.status}: ${path}`);
 }
}
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
const meta=JSON.parse(fs.readFileSync('tests/rv/.build/v6-3/source.json','utf8'));
let prefix=fs.readFileSync(meta.source,'utf8');
if(meta.fullBook||crypto.createHash('sha256').update(prefix).digest('hex')!==meta.sha256)throw Error('Wrong or stale RV build for random-campaign report');
for(const [from,to] of Object.entries(meta.dependencySubstitutions))prefix=prefix.replaceAll(from,to);
if(!fs.readFileSync('tests/rv/.build/v6-3/market.clar','utf8').startsWith(prefix+'\n'))throw Error('RV production prefix differs beyond dependency substitutions');
const hashes={};for(const f of ['contracts/markets-sbtc-stx-jing-v6-3.clar','tests/rv/v6-3/properties.clar','tests/rv/v6-3/build.py','tests/rv/v6-3/run-seeded.mjs','tests/rv/v6-3/strict-ft.clar','tests/rv/mock-lazer-oracle.clar','tests/rv/mock-jing-ladder.clar','tests/rv/.build/v6-3/core.clar','tests/rv/.build/v6-3/ladder.clar','tests/rv/.build/v6-3/market.clar'])hashes[f]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync('tests/rv/v6-3/results.json',JSON.stringify({generatedAt:new Date().toISOString(),hashes,results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
