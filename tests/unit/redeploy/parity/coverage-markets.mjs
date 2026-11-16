import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const pair=process.argv[2];
assert.ok(['sbtc-usdcx','stx-usdcx'].includes(pair));
const dir=`tests/unit/parity-${pair}/.build`,meta=JSON.parse(fs.readFileSync(`${dir}/source.json`));
const results=JSON.parse(fs.readFileSync(`${dir}/results.json`));
assert.ok(results.success&&!results.numFailedTests&&!results.numPendingTests&&!results.numTodoTests,'Coverage requires a complete passing market run');
const source=fs.readFileSync(meta.sourcePath,'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),meta.sha256);
let expected=source;for(const [a,b] of Object.entries(meta.substitutions))expected=expected.replaceAll(a,b);
assert.equal(fs.readFileSync(`${dir}/market.clar`,'utf8'),expected);
const functions=new Map(),lines=new Map(),branches=new Map();let records=0;
for(const record of fs.readFileSync(`${dir}/lcov.info`,'utf8').split('end_of_record')){
 if(!record.split('\n').some(l=>l.startsWith('SF:')&&l.endsWith(`/${dir}/market.clar`)))continue;
 records++;
 for(const line of record.split('\n')){
  const [kind,rest]=line.split(':');if(!rest)continue;const v=rest.split(',');
  if(kind==='FNDA')functions.set(v[1],(functions.get(v[1])??0)+Number(v[0]));
  if(kind==='DA')lines.set(v[0],(lines.get(v[0])??0)+Number(v[1]));
  if(kind==='BRDA'){const key=v.slice(0,3).join(',');branches.set(key,(branches.get(key)??0)+(v[3]==='-'?0:Number(v[3])));}
 }
}
assert.ok(records,'No market coverage');
const metric=m=>({hit:[...m.values()].filter(n=>n>0).length,total:m.size,percent:Number((100*[...m.values()].filter(n=>n>0).length/m.size).toFixed(2)),uncovered:[...m].filter(([,n])=>!n).map(([key])=>key)});
const report={source:meta.sourcePath,sha256:meta.sha256,records,functions:metric(functions),lines:metric(lines),branches:metric(branches)};
fs.writeFileSync(`${dir}/coverage.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

assert.equal(report.functions.percent,100,"All production market functions must be covered");
assert.equal(report.lines.percent,100,"All production market lines must be covered");
assert.ok(report.branches.percent>=99.75,"Market branch coverage must remain at least 99.75%");
